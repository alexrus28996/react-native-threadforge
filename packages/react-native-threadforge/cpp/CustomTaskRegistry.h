#pragma once

#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

#include "TaskUtils.h"
#include "nlohmann/json.hpp"

namespace threadforge {

class CustomTaskRegistry {
public:
    static CustomTaskRegistry& instance();

    void registerTask(const std::string& name, const std::string& definitionJson);
    void unregisterTask(const std::string& name);
    bool hasTask(const std::string& name) const;
    TaskFunction createTask(const std::string& name, const std::string& payloadJson) const;

private:
    struct TaskDefinition {
        std::vector<nlohmann::json> steps;
    };

    nlohmann::json instantiateDescriptor(const nlohmann::json& descriptorTemplate, const nlohmann::json& payload) const;

    mutable std::mutex mutex_;
    std::unordered_map<std::string, TaskDefinition> tasks_;
};

} // namespace threadforge
