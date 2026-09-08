#include <Arduino.h>
#include <ModbusMaster.h>
#include "modbus_sensors.h"
#include "config.h"

// Direcciones Modbus de los 3 sensores en el bus RS-485 de este esclavo.
static const uint8_t SENSOR_MODBUS_ADDR[SENSORS_PER_SLAVE] = {1, 2, 3};

static ModbusMaster node;

static void preTransmission() {
  digitalWrite(RS485_DE_RE_PIN, HIGH);
}

static void postTransmission() {
  digitalWrite(RS485_DE_RE_PIN, LOW);
}

void modbusInit() {
  pinMode(RS485_DE_RE_PIN, OUTPUT);
  digitalWrite(RS485_DE_RE_PIN, LOW);

  Serial2.begin(MODBUS_BAUD, SERIAL_8N1, RS485_RX_PIN, RS485_TX_PIN);
  node.preTransmission(preTransmission);
  node.postTransmission(postTransmission);
}

// Lee un sensor de humedad/temperatura de suelo RS485 generico.
// Mapa de registros asumido (habitual en sensores chinos economicos,
// funcion 0x03): reg 0x0000 = humedad (valor/10 = %HR),
// reg 0x0001 = temperatura (valor/10 = C, con signo).
// VERIFICA este mapa contra el datasheet real del sensor que compres:
// algunos modelos usan otros registros o factores de escala distintos.
static bool readOneSensor(uint8_t modbusAddr, SensorReading &out) {
  node.begin(modbusAddr, Serial2);

  for (uint8_t attempt = 0; attempt <= MODBUS_READ_RETRIES; attempt++) {
    uint8_t result = node.readHoldingRegisters(0x0000, 2);
    if (result == node.ku8MBSuccess) {
      uint16_t humRaw = node.getResponseBuffer(0);
      int16_t tempRaw = (int16_t)node.getResponseBuffer(1);
      out.humidity = humRaw / 10.0f;
      out.temperature = tempRaw / 10.0f;
      out.ok = 1;
      return true;
    }
    delay(50);
  }

  out.humidity = 0;
  out.temperature = 0;
  out.ok = 0;
  return false;
}

void readAllSensors(SensorReading out[SENSORS_PER_SLAVE]) {
  for (uint8_t i = 0; i < SENSORS_PER_SLAVE; i++) {
#if SIMULATE_SENSORS
    out[i].humidity = random(200, 400) / 10.0f;    // 20.0% - 40.0%
    out[i].temperature = random(150, 300) / 10.0f; // 15.0C - 30.0C
    out[i].ok = 1;
    DBG_PRINT("Sensor addr ");
    DBG_PRINT(SENSOR_MODBUS_ADDR[i]);
    DBG_PRINTLN(": SIMULADO");
#else
    bool ok = readOneSensor(SENSOR_MODBUS_ADDR[i], out[i]);
    DBG_PRINT("Sensor addr ");
    DBG_PRINT(SENSOR_MODBUS_ADDR[i]);
    DBG_PRINTLN(ok ? ": OK" : ": FALLO");
#endif
    delay(SENSOR_READ_GAP_MS);
  }
}
