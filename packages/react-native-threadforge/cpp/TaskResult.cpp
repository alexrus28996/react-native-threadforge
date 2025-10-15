#include "TaskResult.h"

#include <algorithm>

#include "nlohmann/json.hpp"

namespace threadforge {

namespace {

nlohmann::json parseJsonOrValue(const std::string& value) {
    if (value.empty()) {
        return nullptr;
    }

    try {
        return nlohmann::json::parse(value);
    } catch (const nlohmann::json::parse_error&) {
        return value;
    }
}

} // namespace

TaskResult makeSuccessResult(const std::string& valueJson) {
    TaskResult result;
    result.success = true;
    result.valueJson = valueJson;
    return result;
}

TaskResult makeErrorResult(const std::string& message, const std::string& stack) {
    TaskResult result;
    result.success = false;
    result.errorMessage = message;
    result.errorStack = stack;
    return result;
}

TaskResult makeCancelledResult() {
    TaskResult result;
    result.success = false;
    result.cancelled = true;
    result.errorMessage = "Task cancelled";
    return result;
}

std::string serializeTaskResult(const TaskResult& result) {
    nlohmann::json json;

    if (result.cancelled) {
        json["status"] = "cancelled";
        json["message"] = result.errorMessage.empty() ? "Task cancelled" : result.errorMessage;
        if (!result.errorStack.empty()) {
            json["stack"] = result.errorStack;
        }
        return json.dump();
    }

    if (result.success) {
        json["status"] = "ok";
        json["value"] = parseJsonOrValue(result.valueJson);
        return json.dump();
    }

    json["status"] = "error";
    json["message"] = result.errorMessage.empty() ? "ThreadForge task failed" : result.errorMessage;
    if (!result.errorStack.empty()) {
        json["stack"] = result.errorStack;
    }
    return json.dump();
}

} // namespace threadforge
