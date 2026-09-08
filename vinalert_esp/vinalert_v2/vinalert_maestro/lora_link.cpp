#include <SPI.h>
#include <LoRa.h>
#include <string.h>
#include "lora_link.h"
#include "config.h"

static bool loraReceiveRaw(uint8_t *buf, size_t maxLen, size_t &outLen, uint32_t timeoutMs) {
  uint32_t start = millis();
  while (millis() - start < timeoutMs) {
    int packetSize = LoRa.parsePacket();
    if (packetSize > 0) {
      size_t n = 0;
      while (LoRa.available() && n < maxLen) {
        buf[n++] = (uint8_t)LoRa.read();
      }
      outLen = n;
      return true;
    }
    delay(5);
  }
  return false;
}

void loraInit() {
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_CS);
  LoRa.setPins(LORA_CS, LORA_RST, LORA_DI0);

  if (!LoRa.begin(LORA_BAND)) {
    DBG_PRINTLN("ERROR: no se pudo iniciar el modulo LoRa");
    while (true) { delay(1000); } // sin radio no hay ciclo posible; mejor detenerse aqui que operar a ciegas
  }

  LoRa.setSyncWord(LORA_SYNC_WORD);
  LoRa.setTxPower(LORA_TX_POWER_DBM);
  DBG_PRINTLN("LoRa iniciado (maestro)");
}

bool loraSendBeacon(uint32_t epoch, uint32_t cycleSeconds) {
  BeaconPacket pkt;
  pkt.magic = VINALERT_MAGIC;
  pkt.type = MSG_BEACON;
  pkt.epoch = epoch;
  pkt.cycleSeconds = cycleSeconds;

  LoRa.beginPacket();
  LoRa.write((uint8_t *)&pkt, sizeof(pkt));
  bool ok = LoRa.endPacket() == 1;
  DBG_PRINT("Beacon enviado, epoch=");
  DBG_PRINTLN(epoch);
  return ok;
}

bool loraSendPoll(uint8_t slaveId) {
  PollPacket pkt;
  pkt.magic = VINALERT_MAGIC;
  pkt.type = MSG_POLL;
  pkt.slaveId = slaveId;

  LoRa.beginPacket();
  LoRa.write((uint8_t *)&pkt, sizeof(pkt));
  return LoRa.endPacket() == 1;
}

bool loraReceiveData(DataPacket &out, uint32_t timeoutMs) {
  uint8_t buf[64];
  size_t len = 0;
  if (!loraReceiveRaw(buf, sizeof(buf), len, timeoutMs)) {
    return false;
  }
  if (len != sizeof(DataPacket)) return false;
  if (buf[0] != VINALERT_MAGIC || buf[1] != MSG_DATA) return false;

  memcpy(&out, buf, sizeof(DataPacket));
  return true;
}

void loraSleep() {
  LoRa.sleep();
}
