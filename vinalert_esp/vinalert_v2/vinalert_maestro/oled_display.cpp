#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "oled_display.h"
#include "config.h"

#define OLED_WIDTH 128
#define OLED_HEIGHT 64
#define OLED_LOG_LINES 6 // lineas visibles con texto tamano 1 en 64px de alto

static Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, OLED_RST_PIN);
static String logLines[OLED_LOG_LINES];
static uint8_t logCount = 0;
static bool oledOk = false;

void oledInit() {
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
  // Sin esto, un bus I2C atascado (p.ej. OLED ausente o en otra direccion/
  // pines) puede colgar la llamada indefinidamente y el watchdog acaba
  // reiniciando el nodo en bucle. Con el timeout, simplemente falla rapido.
  Wire.setTimeOut(1000);

  Wire.beginTransmission(OLED_I2C_ADDR);
  uint8_t probeError = Wire.endTransmission();
  if (probeError != 0) {
    DBG_PRINT("ERROR: OLED no responde en I2C (addr 0x");
    DBG_PRINT(OLED_I2C_ADDR, HEX);
    DBG_PRINT(", error ");
    DBG_PRINT(probeError);
    DBG_PRINTLN(")");
    oledOk = false;
    return;
  }

  oledOk = display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR);
  if (!oledOk) {
    DBG_PRINTLN("ERROR: no se pudo inicializar la pantalla OLED");
    return;
  }

  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.clearDisplay();
  display.display();
}

void oledLog(const String &line) {
  DBG_PRINTLN(line);

  if (!oledOk) return;

  if (logCount < OLED_LOG_LINES) {
    logLines[logCount++] = line;
  } else {
    for (uint8_t i = 1; i < OLED_LOG_LINES; i++) logLines[i - 1] = logLines[i];
    logLines[OLED_LOG_LINES - 1] = line;
  }

  display.clearDisplay();
  display.setCursor(0, 0);
  for (uint8_t i = 0; i < logCount; i++) {
    display.println(logLines[i]);
  }
  display.display();
}

void oledOff() {
  if (!oledOk) return;
  display.clearDisplay();
  display.display();
  // corta el panel/charge pump del SSD1306; sin esto sigue consumiendo
  // aunque este "en negro" y aunque el ESP32 entre en deep sleep.
  display.ssd1306_command(SSD1306_DISPLAYOFF);
}
