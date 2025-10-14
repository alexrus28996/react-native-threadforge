#pragma once

#include <functional>
#include <string>
#include <unordered_map>

#include "nlohmann/json.hpp"

#include "ThreadPool.h"

namespace threadforge {

struct TaskDescriptor {
    std::string type;
    std::unordered_map<std::string, std::string> params;
    nlohmann::json json;
};

TaskDescriptor parseTaskData(const std::string& taskData);
TaskFunction createTaskFunction(const TaskDescriptor& descriptor);
TaskPriority toTaskPriority(int priority);

} // namespace threadforge
