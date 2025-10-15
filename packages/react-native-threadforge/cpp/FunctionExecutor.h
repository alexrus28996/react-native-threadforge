#pragma once

#include <chrono>
#include <functional>
#include <string>

#include "TaskResult.h"

namespace threadforge {

TaskResult runSerializedFunction(const std::string& taskId,
                                 const std::string& functionSource,
                                 const std::function<void(double)>& progressEmitter,
                                 std::chrono::milliseconds progressThrottle,
                                 const std::function<bool()>& isCancelled);

} // namespace threadforge
