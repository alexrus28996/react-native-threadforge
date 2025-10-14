#include "TaskUtils.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <iomanip>
#include <sstream>

namespace threadforge {

TaskDescriptor parseTaskData(const std::string& taskData) {
    TaskDescriptor descriptor;
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

std::function<std::string()> createTaskFunction(const TaskDescriptor& descriptor) {
    if (descriptor.type == "HEAVY_LOOP") {
        const auto iterations = static_cast<long long>(std::max<long long>(0, getLongParam(descriptor, "iterations", 0)));
        return [iterations]() {
            double total = 0.0;
            for (long long i = 0; i < iterations; ++i) {
                total += std::sqrt(static_cast<double>(i));
            }

            std::ostringstream oss;
            oss << std::fixed << std::setprecision(2) << total;
            return oss.str();
        };
    }

    if (descriptor.type == "TIMED_LOOP") {
        const auto durationMs = std::max<long long>(0, getLongParam(descriptor, "durationMs", 0));
        return [durationMs]() {
            const auto start = std::chrono::steady_clock::now();
            const auto deadline = start + std::chrono::milliseconds(durationMs);
            double sum = 0.0;
            long long iterations = 0;

            while (std::chrono::steady_clock::now() < deadline) {
                sum += std::sqrt(static_cast<double>((iterations % 10000) + 1));
                ++iterations;
            }

            const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                std::chrono::steady_clock::now() - start);

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
        return [iterations, offset]() {
            double total = 0.0;
            for (long long i = 0; i < iterations; ++i) {
                total += std::sqrt(static_cast<double>(i + offset));
            }

            std::ostringstream oss;
            oss << "Task completed (" << std::fixed << std::setprecision(0) << total << ")";
            return oss.str();
        };
    }

    if (descriptor.type == "INSTANT_MESSAGE") {
        const auto message = getStringParam(descriptor, "message", "Task completed");
        return [message]() { return message; };
    }

    return []() { return std::string("Unknown task type"); };
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
