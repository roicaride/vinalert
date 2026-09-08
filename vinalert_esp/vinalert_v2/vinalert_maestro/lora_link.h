#ifndef LORA_LINK_H
#define LORA_LINK_H

#include "vinalert_protocol.h"

void loraInit();
bool loraSendBeacon(uint32_t epoch, uint32_t cycleSeconds);
bool loraSendPoll(uint8_t slaveId);
// Espera hasta timeoutMs una respuesta DATA valida de un esclavo.
bool loraReceiveData(DataPacket &out, uint32_t timeoutMs);
void loraSleep();

#endif // LORA_LINK_H
