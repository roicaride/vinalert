#include <Arduino.h>
#include <esp_sleep.h>
#include "config.h"
#include "vinalert_protocol.h"
#include "lora_link.h"
#include "modbus_sensors.h"
#include "oled_display.h"

RTC_DATA_ATTR uint32_t bootCount = 0;

static float readBatteryVoltage() {
  uint32_t raw = analogRead(BATTERY_ADC_PIN);
  return (raw / 4095.0f) * 3.3f * BATTERY_ADC_RATIO * BATTERY_ADC_CORRECTION;
}

static void sleepFor(uint32_t nominalCycleSec) {
  // Igual que el maestro: se descuenta el tiempo activo ya consumido este
  // ciclo. Sin esto, el esclavo duerme el ciclo completo SIN restar lo que
  // ya tardo en despertar/sincronizar/leer, así que su periodo total acaba
  // siendo mas largo que el del maestro y se desincronizan cada vez mas.
  uint32_t elapsedSec = millis() / 1000;
  uint32_t sleepSec = (elapsedSec < nominalCycleSec)
                          ? (nominalCycleSec - elapsedSec)
                          : MIN_SLEEP_SEC;

  oledLog("Durmiendo " + String(sleepSec) + "s");
  oledOff();
  loraSleep();
  esp_sleep_enable_timer_wakeup((uint64_t)sleepSec * 1000000ULL);
  esp_deep_sleep_start();
}

void setup() {
  DBG_BEGIN(SERIAL_BAUD);
  delay(200); // margen para que el monitor serie se enganche tras el deep sleep
  bootCount++;

  loraInit();
  modbusInit();
  oledInit();
  oledLog("Esclavo #" + String(SLAVE_ID) + " ciclo #" + String(bootCount));

  oledLog("Esperando beacon...");
  BeaconPacket beacon;
  if (!loraReceiveBeacon(beacon, BEACON_LISTEN_TIMEOUT_MS)) {
    oledLog("Sin beacon");
    sleepFor(DEFAULT_CYCLE_SEC);
    return; // no se alcanza: esp_deep_sleep_start() reinicia el chip
  }
  oledLog("Sincronizado");

  if (!loraWaitForMyPoll(SLAVE_ID, POLL_LISTEN_TIMEOUT_MS)) {
    oledLog("Sin mi turno");
    sleepFor(beacon.cycleSeconds);
    return;
  }

  DataPacket pkt;
  pkt.magic = VINALERT_MAGIC;
  pkt.type = MSG_DATA;
  pkt.slaveId = SLAVE_ID;
  readAllSensors(pkt.sensors);
  for (uint8_t s = 0; s < SENSORS_PER_SLAVE; s++) {
    if (pkt.sensors[s].ok) {
      oledLog("S" + String(s + 1) + " " + String(pkt.sensors[s].temperature, 1) + "C " + String(pkt.sensors[s].humidity, 0) + "%");
    } else {
      oledLog("S" + String(s + 1) + " ERROR");
    }
  }
  pkt.batteryVoltage = readBatteryVoltage();
  pkt.timestamp = beacon.epoch;

  bool sent = loraSendData(pkt);
  oledLog(sent ? "Enviado a maestro" : "ERROR envio");

  sleepFor(beacon.cycleSeconds);
}

void loop() {
  // no se usa: cada ciclo arranca de nuevo en setup() tras el deep sleep
}
