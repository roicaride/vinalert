#ifndef LORA_LINK_H
#define LORA_LINK_H

#include "vinalert_protocol.h"

void loraInit();
bool loraReceiveBeacon(BeaconPacket &out, uint32_t timeoutMs);
// Escucha hasta timeoutMs esperando un POLL dirigido a mySlaveId.
// Descarta (e ignora) los POLL dirigidos a otros esclavos y sigue esperando.
bool loraWaitForMyPoll(uint8_t mySlaveId, uint32_t timeoutMs);
bool loraSendData(const DataPacket &pkt);
void loraSleep();

#endif // LORA_LINK_H
