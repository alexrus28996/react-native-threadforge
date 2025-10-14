#pragma once

#include <functional>
#include <string>
#include <unordered_map>

#include "ThreadPool.h"

namespace threadforge {

struct TaskDescriptor {
    std::string type;
    std::unordered_map<std::string, std::string> params;
};

TaskDescriptor parseTaskData(const std::string& taskData);
std::function<std::string()> createTaskFunction(const TaskDescriptor& descriptor);
TaskPriority toTaskPriority(int priority);

} // namespace threadforge
