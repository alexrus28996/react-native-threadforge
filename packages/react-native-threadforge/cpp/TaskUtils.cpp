#include "TaskUtils.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <iomanip>
#include <sstream>
#include <stdexcept>

#include "nlohmann/json.hpp"

namespace threadforge {

namespace {

void validateDescriptor(const TaskDescriptor& descriptor) {
    if (descriptor.type.empty()) {
        throw std::invalid_argument("Task descriptor missing type");
    }

    const auto requireKey = [&](const std::string& key) {
        if (descriptor.params.find(key) == descriptor.params.end()) {
            throw std::invalid_argument("Task descriptor missing required field: " + key);
        }
    };

    const auto requirePositive = [&](const std::string& key) {
        requireKey(key);
        try {
            const auto value = std::stoll(descriptor.params.at(key));
            if (value <= 0) {
                throw std::invalid_argument(key + " must be greater than 0");
            }
        } catch (const std::invalid_argument&) {
            throw std::invalid_argument(key + " must be a number");
        } catch (const std::out_of_range&) {
            throw std::invalid_argument(key + " is out of range");
        }
    };

    if (descriptor.type == "HEAVY_LOOP") {
        requirePositive("iterations");
    } else if (descriptor.type == "TIMED_LOOP") {
        requirePositive("durationMs");
    } else if (descriptor.type == "MIXED_LOOP") {
        requirePositive("iterations");
    }
}

} // namespace

TaskDescriptor parseTaskData(const std::string& taskData) {
    if (taskData.empty()) {
        throw std::invalid_argument("Task descriptor cannot be empty");
    }

    TaskDescriptor descriptor;
    try {
        const auto json = nlohmann::json::parse(taskData);
        if (!json.is_object()) {
            throw std::invalid_argument("Task descriptor must be a JSON object");
        }

        auto typeIt = json.find("type");
        if (typeIt == json.end() || !typeIt->is_string()) {
            throw std::invalid_argument("Task descriptor missing string \"type\"");
        }

        descriptor.type = typeIt->get<std::string>();
        descriptor.json = json;
        for (auto it = json.begin(); it != json.end(); ++it) {
            if (it.key() == "type") {
                continue;
            }

            if (it->is_string()) {
                descriptor.params[it.key()] = it->get<std::string>();
            } else if (it->is_number_integer()) {
                descriptor.params[it.key()] = std::to_string(it->get<long long>());
            } else if (it->is_number_float()) {
                descriptor.params[it.key()] = std::to_string(it->get<double>());
            } else if (it->is_boolean()) {
                descriptor.params[it.key()] = it->get<bool>() ? "true" : "false";
            } else {
                descriptor.params[it.key()] = it->dump();
            }
        }

        validateDescriptor(descriptor);
        return descriptor;
    } catch (const nlohmann::json::parse_error&) {
        // Fallback to legacy parsing below
    }

    std::stringstream ss(taskData);
    std::string segment;
    bool first = true;

    while (std::getline(ss, segment, '|')) {
        if (segment.empty()) {
            continue;
        }

        if (first) {
            descriptor.type = segment;
            first = false;
            continue;
        }

        const auto separator = segment.find('=');
        if (separator == std::string::npos) {
            continue;
        }

        const auto key = segment.substr(0, separator);
        const auto value = segment.substr(separator + 1);
        descriptor.params[key] = value;
    }

    if (descriptor.type.empty()) {
        throw std::invalid_argument("Legacy task descriptor missing type");
    }

    descriptor.json["type"] = descriptor.type;
    for (const auto& entry : descriptor.params) {
        descriptor.json[entry.first] = entry.second;
    }

    validateDescriptor(descriptor);
    return descriptor;
}

namespace {

long long getLongParam(const TaskDescriptor& descriptor, const std::string& key, long long defaultValue = 0) {
    const auto it = descriptor.params.find(key);
    if (it == descriptor.params.end()) {
        return defaultValue;
    }

    try {
        return std::stoll(it->second);
    } catch (...) {
        return defaultValue;
    }
}

std::string getStringParam(const TaskDescriptor& descriptor, const std::string& key, const std::string& defaultValue = "") {
    const auto it = descriptor.params.find(key);
    if (it == descriptor.params.end()) {
        return defaultValue;
    }

    return it->second;
}

} // namespace

TaskFunction createTaskFunction(const TaskDescriptor& descriptor) {
    if (descriptor.type == "HEAVY_LOOP") {
        const auto iterations = static_cast<long long>(std::max<long long>(0, getLongParam(descriptor, "iterations", 0)));
        return [iterations](const ProgressCallback& progress) {
            double total = 0.0;
            const long long chunk = std::max<long long>(1, iterations / 100);
            for (long long i = 0; i < iterations; ++i) {
                total += std::sqrt(static_cast<double>(i));
                if (iterations > 0 && (i % chunk == 0 || i == iterations - 1)) {
                    progress(std::min(1.0, static_cast<double>(i + 1) / static_cast<double>(iterations)));
                }
            }

            std::ostringstream oss;
            oss << std::fixed << std::setprecision(2) << total;
            return oss.str();
        };
    }

    if (descriptor.type == "TIMED_LOOP") {
        const auto durationMs = std::max<long long>(0, getLongParam(descriptor, "durationMs", 0));
        return [durationMs](const ProgressCallback& progress) {
            const auto start = std::chrono::steady_clock::now();
            const auto deadline = start + std::chrono::milliseconds(durationMs);
            double sum = 0.0;
            long long iterations = 0;
            auto nextUpdate = start;

            while (std::chrono::steady_clock::now() < deadline) {
                sum += std::sqrt(static_cast<double>((iterations % 10000) + 1));
                ++iterations;
                const auto now = std::chrono::steady_clock::now();
                if (now >= nextUpdate) {
                    const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - start).count();
                    const double progressValue = durationMs > 0
                        ? std::min(1.0, static_cast<double>(elapsed) / static_cast<double>(durationMs))
                        : 1.0;
                    progress(progressValue);
                    nextUpdate = now + std::chrono::milliseconds(100);
                }
            }

            const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::steady_clock::now() - start);

            progress(1.0);

            std::ostringstream oss;
            oss << "\xF0\x9F\x95\x90 Task finished in ~" << std::fixed << std::setprecision(1)
                << (elapsed.count() / 1000.0) << "s | Iterations: "
                << iterations << " | Sum: " << std::setprecision(2) << sum;
            return oss.str();
        };
    }

    if (descriptor.type == "MIXED_LOOP") {
        const auto iterations = std::max<long long>(0, getLongParam(descriptor, "iterations", 0));
        const auto offset = static_cast<long long>(getLongParam(descriptor, "offset", 0));
        return [iterations, offset](const ProgressCallback& progress) {
            double total = 0.0;
            const long long chunk = std::max<long long>(1, iterations / 100);
            for (long long i = 0; i < iterations; ++i) {
                total += std::sqrt(static_cast<double>(i + offset));
                if (iterations > 0 && (i % chunk == 0 || i == iterations - 1)) {
                    progress(std::min(1.0, static_cast<double>(i + 1) / static_cast<double>(iterations)));
                }
            }

            std::ostringstream oss;
            oss << "Task completed (" << std::fixed << std::setprecision(0) << total << ")";
            return oss.str();
        };
    }

    if (descriptor.type == "INSTANT_MESSAGE") {
        const auto message = getStringParam(descriptor, "message", "Task completed");
        return [message](const ProgressCallback& progress) {
            progress(1.0);
            return message;
        };
    }

    return [](const ProgressCallback& progress) {
        progress(1.0);
        return std::string("Unknown task type");
    };
}

TaskPriority toTaskPriority(int priority) {
    switch (priority) {
        case 2:
            return TaskPriority::HIGH;
        case 0:
            return TaskPriority::LOW;
        default:
            return TaskPriority::NORMAL;
    }
}

} // namespace threadforge
