#ifndef CONFIG_H
#define CONFIG_H

// ===================== DEBUG =====================
#define DEBUG 1
#if DEBUG
  #define DBG_BEGIN(baud) Serial.begin(baud)
  #define DBG_PRINT(...) Serial.print(__VA_ARGS__)
  #define DBG_PRINTLN(...) Serial.println(__VA_ARGS__)
#else
  #define DBG_BEGIN(baud)
  #define DBG_PRINT(...)
  #define DBG_PRINTLN(...)
#endif
#define SERIAL_BAUD 115200

// ===================== LoRa (TTGO LoRa32 V2.1) =====================
// Pinout estandar de esta placa. Verifica contra tu revision exacta.
#define LORA_SCK   5
#define LORA_MISO  19
#define LORA_MOSI  27
#define LORA_CS    18
#define LORA_RST   23
#define LORA_DI0   26

// ¡IMPORTANTE! Ajusta segun la version de tu placa: 433E6 / 868E6 / 915E6
#define LORA_BAND  868E6
// Palabra de sincronizacion "privada" para aislar esta red punto a punto
// de otras redes LoRa cercanas. Debe coincidir en maestro y esclavos.
#define LORA_SYNC_WORD 0xF3
// Potencia de transmision. En EU868 el limite tipico es 14dBm en la
// sub-banda mas usada; ajusta segun normativa local y banda elegida.
#define LORA_TX_POWER_DBM 14

// ===================== OLED (SSD1306, integrada en la placa) =====================
#define OLED_SDA_PIN 21
#define OLED_SCL_PIN 22
// -1: con 16, display.begin() se colgaba justo despues de un probe I2C que
// si respondia (ver sesion de diagnostico en el esclavo) — muchos modulos
// SSD1306 se auto-resetean por hardware al alimentarse y no necesitan pin
// de reset. Si tu maestro tambien se quedaba colgado tras "LoRa iniciado",
// esto deberia arreglarlo igual.
#define OLED_RST_PIN -1
#define OLED_I2C_ADDR 0x3C

// ===================== Red de esclavos =====================
#define NUM_SLAVES 2
static const uint8_t SLAVE_IDS[NUM_SLAVES] = {1, 2};
// Mapeo esclavo -> parcela_id del backend (ambos esclavos monitorizan la Parcela 1)
static const int PARCELA_IDS[NUM_SLAVES] = {1, 1};

// Mapeo esclavo -> IDs de sensores en el backend (Esclavo 1: 1, 2, 3 | Esclavo 2: 4, 5, 6)
static const int SENSOR_IDS[NUM_SLAVES][SENSORS_PER_SLAVE] = {
  {1, 2, 3},
  {4, 5, 6}
};


#define POLL_TIMEOUT_MS      2000  // espera de respuesta por intento
#define POLL_RETRIES         3     // reintentos por esclavo antes de darlo por timeout
#define BEACON_GUARD_MS      500   // pausa tras el beacon antes de empezar a interrogar
#define INTER_SLAVE_DELAY_MS 200   // pausa entre esclavos

// ===================== Ciclo / energia =====================
// El intervalo REAL ya no vive aqui: se configura desde la web (Configuracion
// -> Dispositivos ESP32) y el maestro lo consulta cada ciclo en CONFIG_URL,
// guardandolo en memoria RTC. Esta constante solo se usa en el arranque en
// frio, antes del primer contacto con el servidor, y como respaldo si el
// dispositivo nunca llega a hablar con el.
//
// Se deja en 30s para que un nodo recien flasheado siga siendo comodo de
// probar en el banco: en cuanto contacte con el servidor adoptara el valor
// de campo que tengas puesto en la web. OJO igualmente: a 30s el consumo de
// LoRa+WiFi+HTTP cada ciclo vacia la bateria en horas en vez de meses.
#define DEFAULT_CYCLE_INTERVAL_SEC 30UL
// Topes de seguridad sobre lo que responda el servidor: aunque el backend ya
// valida el rango, un valor absurdo aqui dejaria el nodo mudo o lo freiria a
// ciclos. Deben coincidir con INTERVALO_CICLO_MIN/MAX_SEG de app/schemas.py.
#define MIN_CYCLE_INTERVAL_SEC 30UL
#define MAX_CYCLE_INTERVAL_SEC 86400UL
// Suelo minimo de sueno para no reintentar en bucle si un ciclo se alarga
// demasiado.
#define MIN_SLEEP_SEC 10UL

// ===================== WiFi / servidor =====================
// WIFI_SSID, WIFI_PASSWORD, SERVER_BASE_URL y API_KEY viven en secrets.h,
// que esta en .gitignore para no publicar credenciales. Copia
// secrets.example.h a secrets.h y rellenalo antes de compilar.
#include "secrets.h"

#define WIFI_CONNECT_TIMEOUT_MS 15000

// Se derivan de SERVER_BASE_URL: cuando la URL del backend cambie, solo hay
// que tocar esa linea de secrets.h y no cada endpoint por separado.
#define SERVER_URL SERVER_BASE_URL "/logs/sensor/"
// Aqui pregunta el maestro, cada ciclo, cada cuanto debe despertar.
#define CONFIG_URL SERVER_BASE_URL "/dispositivos/configuracion"
#define HTTP_TIMEOUT_MS 8000

// ===================== NTP =====================
#define NTP_SERVER "pool.ntp.org"
#define NTP_TIMEOUT_MS 10000
// El backend espera fecha_hora en hora LOCAL (no UTC), igual que el
// cliente de referencia: +1h base, +1h mas asumiendo siempre horario de
// verano (no distingue invierno/verano). Si el backend corrige esto mas
// adelante, hay que actualizar estas dos constantes a la vez.
#define GMT_OFFSET_SEC 3600
#define DAYLIGHT_OFFSET_SEC 3600

// ===================== Buffer en flash (reintentos) =====================
#define BUFFER_FILE_PATH "/buffer.jsonl"
// Ahora cada ciclo sube hasta NUM_SLAVES*SENSORS_PER_SLAVE lecturas
// individuales (una peticion HTTP por sensor) en vez de 1 payload
// agregado, asi que el tope se sube proporcionalmente.
#define MAX_BUFFERED_PAYLOADS 60

// ===================== Bateria =====================
#define BATTERY_ADC_PIN 35
// Divisor 2:1 en placa + factor de correccion empirico de la no linealidad
// del ADC del ESP32. Calibra con un multimetro si necesitas precision.
#define BATTERY_ADC_RATIO 2.0f
#define BATTERY_ADC_CORRECTION 1.1f

#endif // CONFIG_H
