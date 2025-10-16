#pragma once

#include <string>

namespace threadforge {

struct TaskResult {
    bool success{false};
    bool cancelled{false};
    std::string valueJson;
    std::string errorMessage;
    std::string errorStack;
};

TaskResult makeSuccessResult(const std::string& valueJson);
TaskResult makeErrorResult(const std::string& message, const std::string& stack = std::string());
TaskResult makeCancelledResult();

std::string serializeTaskResult(const TaskResult& result);

} // namespace threadforge
