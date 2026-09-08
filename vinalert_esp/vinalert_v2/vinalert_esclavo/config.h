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

// ===================== Identidad de este nodo =====================
// ¡CAMBIAR antes de flashear cada esclavo! Debe coincidir con uno de los
// valores de SLAVE_IDS en el config.h del maestro (1, 2, 3...).
#define SLAVE_ID 2

// ===================== LoRa (TTGO LoRa32 V2.1) =====================
// Debe coincidir exactamente con el config.h del maestro.
#define LORA_SCK   5
#define LORA_MISO  19
#define LORA_MOSI  27
#define LORA_CS    18
#define LORA_RST   23
#define LORA_DI0   26

#define LORA_BAND  868E6      // ¡debe coincidir con el maestro!
#define LORA_SYNC_WORD 0xF3   // ¡debe coincidir con el maestro!
#define LORA_TX_POWER_DBM 14

// ===================== OLED (SSD1306, integrada en la placa) =====================
#define OLED_SDA_PIN 21
#define OLED_SCL_PIN 22
// -1: con 16, display.begin() se colgaba justo despues de un probe I2C que
// si respondia (ver sesion de diagnostico) — muchos modulos SSD1306 se
// auto-resetean por hardware al alimentarse y no necesitan pin de reset.
#define OLED_RST_PIN -1
#define OLED_I2C_ADDR 0x3C

// ===================== Ventanas de escucha =====================
// Cuanto espera tras despertar a que llegue el beacon del maestro.
#define BEACON_LISTEN_TIMEOUT_MS 15000
// Cuanto espera, tras el beacon, a que le llegue su turno de sondeo.
// Debe cubrir el tiempo que el maestro tarda en interrogar a los esclavos
// anteriores en su lista (NUM_SLAVES * POLL_TIMEOUT_MS * POLL_RETRIES,
// ver config.h del maestro). 60s cubre holgadamente hasta ~5 esclavos.
#define POLL_LISTEN_TIMEOUT_MS 60000

// Intervalo de ciclo de RESPALDO, usado solo si este esclavo nunca llega a
// oir un beacon (para no quedarse despierto indefinidamente gastando
// bateria). Ya NO tiene que coincidir con nada del maestro: el intervalo real
// se configura desde la web, el maestro lo consulta al servidor y lo difunde
// en cada beacon, y el esclavo adopta ese valor. Cambiar la cadencia del
// sistema no obliga a reflashear ningun esclavo.
#define DEFAULT_CYCLE_SEC 30UL
// Suelo minimo de sueno si el ciclo activo (LoRa+sensores) se alarga mas
// de lo esperado -- mismo motivo que MIN_SLEEP_SEC en el maestro.
#define MIN_SLEEP_SEC 5UL

// ===================== Modbus / RS-485 =====================
// Conversor RS-485 (MAX485 o similar) sobre UART2. Verifica que estos
// pines esten libres en tu revision exacta de placa.
#define RS485_RX_PIN    33 // -> RO del MAX485
#define RS485_TX_PIN    25 // -> DI del MAX485
#define RS485_DE_RE_PIN 32 // -> DE y RE unidos del MAX485

// Baudrate tipico de sensores de humedad/temperatura de suelo RS485
// baratos; verificalo contra el datasheet real (habitual 4800 o 9600).
#define MODBUS_BAUD 4800

#define MODBUS_READ_RETRIES 2   // reintentos por sensor ademas del primer intento
#define SENSOR_READ_GAP_MS 150  // pausa entre lecturas Modbus consecutivas

// 1: genera lecturas aleatorias en vez de leer los sensores Modbus reales,
// para probar el pipeline LoRa -> maestro -> backend sin sensores todavia
// cableados. Pon esto a 0 en cuanto conectes los sensores RS-485 reales.
#define SIMULATE_SENSORS 1

// ===================== Bateria =====================
#define BATTERY_ADC_PIN 35
#define BATTERY_ADC_RATIO 2.0f
#define BATTERY_ADC_CORRECTION 1.1f

#endif // CONFIG_H
