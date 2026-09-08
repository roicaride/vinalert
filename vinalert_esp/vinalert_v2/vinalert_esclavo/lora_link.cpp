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
  DBG_PRINT("LoRa iniciado (esclavo #");
  DBG_PRINT(SLAVE_ID);
  DBG_PRINTLN(")");
}

bool loraReceiveBeacon(BeaconPacket &out, uint32_t timeoutMs) {
  uint8_t buf[64];
  size_t len = 0;
  uint32_t start = millis();

  while (millis() - start < timeoutMs) {
    uint32_t elapsed = millis() - start;
    uint32_t remaining = (elapsed < timeoutMs) ? (timeoutMs - elapsed) : 0;
    if (remaining == 0 || !loraReceiveRaw(buf, sizeof(buf), len, remaining)) return false;

    if (len == sizeof(BeaconPacket) && buf[0] == VINALERT_MAGIC && buf[1] == MSG_BEACON) {
      memcpy(&out, buf, sizeof(BeaconPacket));
      return true;
    }
    // paquete de otro tipo/tamano: se descarta y se sigue escuchando
  }
  return false;
}

bool loraWaitForMyPoll(uint8_t mySlaveId, uint32_t timeoutMs) {
  uint8_t buf[64];
  size_t len = 0;
  uint32_t start = millis();

  while (millis() - start < timeoutMs) {
    uint32_t elapsed = millis() - start;
    uint32_t remaining = (elapsed < timeoutMs) ? (timeoutMs - elapsed) : 0;
    if (remaining == 0 || !loraReceiveRaw(buf, sizeof(buf), len, remaining)) return false;

    if (len == sizeof(PollPacket) && buf[0] == VINALERT_MAGIC && buf[1] == MSG_POLL) {
      PollPacket pkt;
      memcpy(&pkt, buf, sizeof(PollPacket));
      if (pkt.slaveId == mySlaveId) return true;
      // sondeo para otro esclavo: seguir escuchando el siguiente turno
    }
  }
  return false;
}

bool loraSendData(const DataPacket &pkt) {
  LoRa.beginPacket();
  LoRa.write((const uint8_t *)&pkt, sizeof(pkt));
  return LoRa.endPacket() == 1;
}

void loraSleep() {
  LoRa.sleep();
}
