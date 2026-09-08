#include <Arduino.h>
#include <esp_sleep.h>
#include <vector>
#include "config.h"
#include "vinalert_protocol.h"
#include "lora_link.h"
#include "http_upload.h"
#include "storage_buffer.h"
#include "oled_display.h"

RTC_DATA_ATTR uint32_t rtcEpoch = 0; // mejor estimacion de epoch UTC entre ciclos
RTC_DATA_ATTR uint32_t bootCount = 0;
// Intervalo con el que se rige ESTE ciclo: es el que viaja en el beacon y el
// que se duerme al final. 0 = arranque en frio, todavia sin valor.
RTC_DATA_ATTR uint32_t activeCycleSeconds = 0;
// Intervalo nuevo recibido del servidor, a estrenar en el ciclo SIGUIENTE. El
// beacon ya se envio cuando llega la respuesta del servidor, asi que aplicarlo
// de inmediato haria que el maestro durmiese distinto que sus esclavos y la
// red se desincronizaria durante un ciclo. Esperando uno, el valor nuevo se
// anuncia y se usa a la vez.
RTC_DATA_ATTR uint32_t pendingCycleSeconds = 0;

static float readBatteryVoltage() {
  uint32_t raw = analogRead(BATTERY_ADC_PIN);
  return (raw / 4095.0f) * 3.3f * BATTERY_ADC_RATIO * BATTERY_ADC_CORRECTION;
}

// Payload de una lectura individual: el backend espera un POST por sensor
// (parcela_id + sensor_id), no un agregado con todos los esclavos/sensores.
static String buildReadingJson(int parcelaId, int sensorId, const String &isoTime,
                                float hum, float temp, float batt) {
  String json = "{";
  json += "\"parcela_id\":" + String(parcelaId) + ",";
  json += "\"sensor_id\":" + String(sensorId) + ",";
  json += "\"fecha_hora\":\"" + isoTime + "\",";
  json += "\"humedad_suelo_pct\":" + String(hum, 1) + ",";
  json += "\"temperatura_suelo\":" + String(temp, 1) + ",";
  json += "\"bateria\":" + String(batt, 2);
  json += "}";
  return json;
}

static bool pollSlaveWithRetry(uint8_t slaveId, DataPacket &out) {
  for (uint8_t attempt = 0; attempt < POLL_RETRIES; attempt++) {
    loraSendPoll(slaveId);
    if (loraReceiveData(out, POLL_TIMEOUT_MS) && out.slaveId == slaveId) {
      return true;
    }
    DBG_PRINT("Sin respuesta del esclavo ");
    DBG_PRINT(slaveId);
    DBG_PRINT(", intento ");
    DBG_PRINTLN(attempt + 1);
  }
  return false;
}

void setup() {
  DBG_BEGIN(SERIAL_BAUD);
  delay(200); // margen para que el monitor serie se enganche tras el deep sleep
  bootCount++;

  if (activeCycleSeconds == 0) activeCycleSeconds = DEFAULT_CYCLE_INTERVAL_SEC;
  if (pendingCycleSeconds != 0) {
    activeCycleSeconds = pendingCycleSeconds; // configurado desde la web el ciclo pasado
    pendingCycleSeconds = 0;
  }

  loraInit();
  bufferInit();
  oledInit();
  oledLog("MAESTRO ciclo #" + String(bootCount));
  oledLog("Batt " + String(readBatteryVoltage(), 2) + "V");

  uint32_t cycleEpoch = rtcEpoch; // 0 si todavia no hay ninguna sincronizacion NTP previa

  loraSendBeacon(cycleEpoch, activeCycleSeconds);
  oledLog("Beacon " + String(activeCycleSeconds) + "s");
  delay(BEACON_GUARD_MS);

  DataPacket results[NUM_SLAVES];
  bool responded[NUM_SLAVES];

  for (uint8_t i = 0; i < NUM_SLAVES; i++) {
    responded[i] = pollSlaveWithRetry(SLAVE_IDS[i], results[i]);
    oledLog("Esc " + String(SLAVE_IDS[i]) + (responded[i] ? " OK" : " TIMEOUT"));
    delay(INTER_SLAVE_DELAY_MS);
  }

  oledLog("Conectando WiFi...");
  bool wifiUp = wifiConnect(WIFI_CONNECT_TIMEOUT_MS);
  String isoTs;

  if (wifiUp) {
    oledLog("WiFi OK");

    // Preguntar por la configuracion antes que nada: si el servidor esta ahi
    // pero la subida falla, el cambio de cadencia igualmente se entera.
    uint32_t serverCycle = 0;
    if (httpGetCycleSeconds(CONFIG_URL, API_KEY, serverCycle)) {
      if (serverCycle < MIN_CYCLE_INTERVAL_SEC) serverCycle = MIN_CYCLE_INTERVAL_SEC;
      if (serverCycle > MAX_CYCLE_INTERVAL_SEC) serverCycle = MAX_CYCLE_INTERVAL_SEC;
      if (serverCycle != activeCycleSeconds) {
        pendingCycleSeconds = serverCycle;
        oledLog("Nuevo ciclo " + String(serverCycle) + "s");
      }
    }

    if (ntpSync(NTP_TIMEOUT_MS)) {
      rtcEpoch = nowEpochUtc();
      isoTs = nowLocalIso();
    } else {
      rtcEpoch = cycleEpoch + activeCycleSeconds; // estimacion sin NTP
      isoTs = epochToLocalIso(rtcEpoch);
    }

    // reintenta primero lo que quedo pendiente de ciclos anteriores
    std::vector<String> buffered = bufferLoadAll();
    if (!buffered.empty()) {
      oledLog(String(buffered.size()) + " pendientes");
      std::vector<String> stillFailed;
      for (auto &p : buffered) {
        // Payloads de una version anterior del firmware (antes de adoptar
        // el formato del backend real) no llevan parcela_id: nunca van a
        // subir, asi que se descartan en vez de reintentarlos para siempre.
        if (p.indexOf("\"parcela_id\"") < 0) {
          DBG_PRINTLN("Descartado payload en buffer con formato antiguo/invalido");
          continue;
        }
        int code;
        if (!httpPostJson(SERVER_URL, API_KEY, p, code)) {
          stillFailed.push_back(p);
        }
      }
      bufferRewrite(stillFailed);
    }
  } else {
    oledLog("WiFi FALLO");
    rtcEpoch = cycleEpoch + activeCycleSeconds; // estimacion sin NTP
    isoTs = epochToLocalIso(rtcEpoch);
  }

  // Una peticion HTTP por cada sensor que haya leido bien este ciclo (no
  // se suben lecturas de esclavos con timeout ni de sensores en fallo).
  uint8_t sentCount = 0, bufferedCount = 0;
  for (uint8_t i = 0; i < NUM_SLAVES; i++) {
    if (!responded[i]) continue;
    for (uint8_t s = 0; s < SENSORS_PER_SLAVE; s++) {
      if (!results[i].sensors[s].ok) continue;

      int sensorId = SENSOR_IDS[i][s];
      String reading = buildReadingJson(PARCELA_IDS[i], sensorId, isoTs,
                                         results[i].sensors[s].humidity,
                                         results[i].sensors[s].temperature,
                                         results[i].batteryVoltage);

      bool sent = false;
      if (wifiUp) {
        int code;
        sent = httpPostJson(SERVER_URL, API_KEY, reading, code);
      }
      if (sent) {
        sentCount++;
      } else {
        bufferAppend(reading);
        bufferedCount++;
      }
      delay(300);
    }
  }
  oledLog(String(sentCount) + " OK, " + String(bufferedCount) + " pend.");

  if (wifiUp) wifiDisconnect();

  uint32_t elapsedSec = millis() / 1000;
  uint32_t sleepSec = (elapsedSec < activeCycleSeconds)
                          ? (activeCycleSeconds - elapsedSec)
                          : MIN_SLEEP_SEC;

  oledLog("Durmiendo " + String(sleepSec) + "s");
  oledOff();
  loraSleep();
  esp_sleep_enable_timer_wakeup((uint64_t)sleepSec * 1000000ULL);
  esp_deep_sleep_start();
}

void loop() {
  // no se usa: cada ciclo arranca de nuevo en setup() tras el deep sleep
}
