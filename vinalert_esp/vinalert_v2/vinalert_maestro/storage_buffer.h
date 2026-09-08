#ifndef STORAGE_BUFFER_H
#define STORAGE_BUFFER_H

#include <Arduino.h>
#include <vector>

bool bufferInit();
std::vector<String> bufferLoadAll();
void bufferRewrite(const std::vector<String> &keep);
void bufferAppend(const String &payload);

#endif // STORAGE_BUFFER_H
