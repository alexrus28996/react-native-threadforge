#include "CustomTaskRegistry.h"

#include <algorithm>
#include <sstream>
#include <stdexcept>

namespace threadforge {

namespace {

nlohmann::json parseJsonOrThrow(const std::string& input, const std::string& context) {
    try {
        if (input.empty()) {
            return nlohmann::json::object();
        }
        return nlohmann::json::parse(input);
    } catch (const nlohmann::json::parse_error& error) {
        throw std::invalid_argument(context + std::string(": invalid JSON - ") + error.what());
    }
}

nlohmann::json resolvePlaceholder(const nlohmann::json& value, const nlohmann::json& payload) {
    if (!value.is_object()) {
        return value;
    }

    auto it = value.find("fromPayload");
    if (it == value.end() || !it->is_string()) {
        return value;
    }

    const auto path = it->get<std::string>();
    const auto defaultIt = value.find("default");
    const std::vector<std::string> segments = [&]() {
        std::vector<std::string> parts;
        std::stringstream ss(path);
        std::string segment;
        while (std::getline(ss, segment, '.')) {
            if (!segment.empty()) {
                parts.push_back(segment);
            }
        }
        return parts;
    }();

    const nlohmann::json* current = &payload;
    for (const auto& segment : segments) {
        auto child = current->find(segment);
        if (child == current->end()) {
            if (defaultIt != value.end()) {
                return *defaultIt;
            }
            throw std::invalid_argument("Payload missing required field: " + path);
        }
        current = &(*child);
    }

    return *current;
}

} // namespace

CustomTaskRegistry& CustomTaskRegistry::instance() {
    static CustomTaskRegistry registry;
    return registry;
}

void CustomTaskRegistry::registerTask(const std::string& name, const std::string& definitionJson) {
    if (name.empty()) {
        throw std::invalid_argument("Task name cannot be empty");
    }

    const auto definition = parseJsonOrThrow(definitionJson, "Task definition");
    if (!definition.is_object()) {
        throw std::invalid_argument("Task definition must be a JSON object");
    }

    auto stepsIt = definition.find("steps");
    if (stepsIt == definition.end() || !stepsIt->is_array() || stepsIt->empty()) {
        throw std::invalid_argument("Task definition requires a non-empty 'steps' array");
    }

    TaskDefinition taskDefinition;
    for (const auto& step : *stepsIt) {
        if (!step.is_object()) {
            throw std::invalid_argument("Each step must be a JSON object");
        }
        auto typeIt = step.find("type");
        if (typeIt == step.end() || !typeIt->is_string()) {
            throw std::invalid_argument("Each step must include a string 'type'");
        }
        taskDefinition.steps.push_back(step);
    }

    std::lock_guard<std::mutex> lock(mutex_);
    tasks_[name] = std::move(taskDefinition);
}

void CustomTaskRegistry::unregisterTask(const std::string& name) {
    std::lock_guard<std::mutex> lock(mutex_);
    tasks_.erase(name);
}

bool CustomTaskRegistry::hasTask(const std::string& name) const {
    std::lock_guard<std::mutex> lock(mutex_);
    return tasks_.find(name) != tasks_.end();
}

TaskFunction CustomTaskRegistry::createTask(const std::string& name, const std::string& payloadJson) const {
    TaskDefinition definition;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = tasks_.find(name);
        if (it == tasks_.end()) {
            throw std::invalid_argument("Unknown custom task: " + name);
        }
        definition = it->second;
    }

    const auto payload = parseJsonOrThrow(payloadJson, "Task payload");

    std::vector<TaskFunction> stepFunctions;
    std::vector<std::string> stepTypes;

    for (const auto& stepTemplate : definition.steps) {
        nlohmann::json stepJson = instantiateDescriptor(stepTemplate, payload);
        const auto descriptor = parseTaskData(stepJson.dump());
        stepFunctions.push_back(createTaskFunction(descriptor));
        stepTypes.push_back(descriptor.type);
    }

    return [name, stepFunctions = std::move(stepFunctions), stepTypes = std::move(stepTypes)](const ProgressCallback& progress) {
        if (stepFunctions.empty()) {
            progress(1.0);
            return std::string("Custom task has no steps");
        }

        const double stepWeight = 1.0 / static_cast<double>(stepFunctions.size());
        double accumulated = 0.0;
        nlohmann::json results = nlohmann::json::array();

        for (size_t index = 0; index < stepFunctions.size(); ++index) {
            const auto& stepFn = stepFunctions[index];
            std::string stepResult = stepFn([&](double stepProgress) {
                const double normalized = std::min(1.0, std::max(0.0, stepProgress));
                const double overall = std::min(1.0, accumulated + (normalized * stepWeight));
                progress(overall);
            });
            accumulated = std::min(1.0, accumulated + stepWeight);

            nlohmann::json stepSummary;
            stepSummary["index"] = index;
            stepSummary["type"] = stepTypes[index];
            stepSummary["result"] = stepResult;
            results.push_back(stepSummary);
        }

        progress(1.0);

        nlohmann::json summary;
        summary["task"] = name;
        summary["steps"] = results;
        return summary.dump();
    };
}

nlohmann::json CustomTaskRegistry::instantiateDescriptor(const nlohmann::json& descriptorTemplate, const nlohmann::json& payload) const {
    nlohmann::json result = descriptorTemplate;
    for (auto it = descriptorTemplate.begin(); it != descriptorTemplate.end(); ++it) {
        if (it.key() == "type") {
            continue;
        }
        result[it.key()] = resolvePlaceholder(*it, payload);
    }
    return result;
}

} // namespace threadforge
