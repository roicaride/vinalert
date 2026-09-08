#ifndef MODBUS_SENSORS_H
#define MODBUS_SENSORS_H

#include "vinalert_protocol.h"

void modbusInit();
// Lee los SENSORS_PER_SLAVE sensores configurados y rellena out[].
void readAllSensors(SensorReading out[SENSORS_PER_SLAVE]);

#endif // MODBUS_SENSORS_H
