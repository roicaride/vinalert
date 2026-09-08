#include <LittleFS.h>
#include "storage_buffer.h"
#include "config.h"

bool bufferInit() {
  if (!LittleFS.begin(true)) {
    DBG_PRINTLN("ERROR: no se pudo montar LittleFS");
    return false;
  }
  return true;
}

std::vector<String> bufferLoadAll() {
  std::vector<String> lines;
  File f = LittleFS.open(BUFFER_FILE_PATH, FILE_READ);
  if (!f) return lines;

  while (f.available()) {
    String line = f.readStringUntil('\n');
    line.trim();
    if (line.length() > 0) lines.push_back(line);
  }
  f.close();
  return lines;
}

void bufferRewrite(const std::vector<String> &keep) {
  LittleFS.remove(BUFFER_FILE_PATH);
  if (keep.empty()) return;

  File f = LittleFS.open(BUFFER_FILE_PATH, FILE_WRITE);
  if (!f) {
    DBG_PRINTLN("ERROR: no se pudo reescribir el buffer");
    return;
  }
  for (const auto &line : keep) {
    f.println(line);
  }
  f.close();
}

void bufferAppend(const String &payload) {
  auto lines = bufferLoadAll();

  if (lines.size() >= MAX_BUFFERED_PAYLOADS) {
    // descarta las lecturas mas antiguas para no llenar la flash
    lines.erase(lines.begin(), lines.begin() + (lines.size() - MAX_BUFFERED_PAYLOADS + 1));
    DBG_PRINTLN("Buffer lleno: se descartan payloads antiguos");
  }
  lines.push_back(payload);
  bufferRewrite(lines);
}
