#ifndef VINALERT_PROTOCOL_H
#define VINALERT_PROTOCOL_H
// Definicion del protocolo LoRa punto a punto propio de VinAlert.
// IMPORTANTE: este archivo debe ser identico en vinalert_maestro y
// vinalert_esclavo. Si lo modificas, copia el cambio a ambas carpetas
// (Arduino IDE no comparte codigo entre sketches).

#include <stdint.h>

static const uint8_t VINALERT_MAGIC = 0xA1;

enum VinAlertMsgType : uint8_t {
  MSG_BEACON = 0x01, // maestro -> todos
  MSG_POLL   = 0x02, // maestro -> un esclavo
  MSG_DATA   = 0x03, // esclavo -> maestro
};

static const uint8_t SENSORS_PER_SLAVE = 3;

#pragma pack(push, 1)

// Beacon de sincronizacion: el maestro lo difunde al despertar.
struct BeaconPacket {
  uint8_t  magic;
  uint8_t  type;
  uint32_t epoch;        // timestamp UTC de referencia (segundos, 0 = desconocido)
  uint32_t cycleSeconds; // duracion del ciclo hasta el proximo despertar
};

// Solicitud de lectura a un esclavo concreto.
struct PollPacket {
  uint8_t magic;
  uint8_t type;
  uint8_t slaveId;
};

struct SensorReading {
  float   temperature; // grados C
  float   humidity;    // % HR
  uint8_t ok;          // 1 = lectura Modbus valida, 0 = fallo/sensor no respondio
};

// Respuesta de datos de un esclavo.
struct DataPacket {
  uint8_t       magic;
  uint8_t       type;
  uint8_t       slaveId;
  SensorReading sensors[SENSORS_PER_SLAVE];
  float         batteryVoltage;
  uint32_t      timestamp; // epoch recibido en el beacon de este ciclo
};

#pragma pack(pop)

#endif // VINALERT_PROTOCOL_H
