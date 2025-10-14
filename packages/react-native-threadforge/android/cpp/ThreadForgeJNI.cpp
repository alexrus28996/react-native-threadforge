#include <android/log.h>
#include <jni.h>
#include <math.h>
#include <algorithm>
#include <chrono>
#include <functional>
#include <iomanip>
#include <sstream>
#include <string>
#include <unordered_map>

#include "ThreadPool.h"

#define LOG_TAG "ThreadForge"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

using namespace threadforge;

static ThreadPool* g_threadPool = nullptr;

namespace {

struct TaskDescriptor {
    std::string type;
    std::unordered_map<std::string, std::string> params;
};

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

        auto separator = segment.find('=');
        if (separator == std::string::npos) {
            continue;
        }

        auto key = segment.substr(0, separator);
        auto value = segment.substr(separator + 1);
        descriptor.params[key] = value;
    }

    return descriptor;
}

long long getLongParam(const TaskDescriptor& descriptor, const std::string& key, long long defaultValue = 0) {
    auto it = descriptor.params.find(key);
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
    auto it = descriptor.params.find(key);
    if (it == descriptor.params.end()) {
        return defaultValue;
    }
    return it->second;
}

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

    return []() {
        return std::string("Unknown task type");
    };
}

TaskPriority toTaskPriority(jint priority) {
    switch (priority) {
        case 2:
            return TaskPriority::HIGH;
        case 0:
            return TaskPriority::LOW;
        default:
            return TaskPriority::NORMAL;
    }
}

} // namespace

extern "C" {

JNIEXPORT void JNICALL
Java_com_threadforge_ThreadForgeModule_nativeInitialize(JNIEnv* env, jobject, jint threadCount) {
    LOGI("Initializing with %d threads", threadCount);
    if (g_threadPool) {
        delete g_threadPool;
    }
    g_threadPool = new ThreadPool(threadCount);
}

JNIEXPORT void JNICALL
Java_com_threadforge_ThreadForgeModule_nativeShutdown(JNIEnv* env, jobject) {
    if (g_threadPool) {
        g_threadPool->shutdown();
        delete g_threadPool;
        g_threadPool = nullptr;
    }
}

JNIEXPORT jstring JNICALL
Java_com_threadforge_ThreadForgeModule_nativeExecuteTask(JNIEnv* env, jobject, jstring taskId, jint priority, jstring taskData) {
    if (!g_threadPool) {
        return env->NewStringUTF("Error: ThreadForge is not initialized");
    }

    const char* taskIdChars = env->GetStringUTFChars(taskId, nullptr);
    const char* taskDataChars = env->GetStringUTFChars(taskData, nullptr);

    std::string taskIdStr(taskIdChars ? taskIdChars : "");
    std::string taskDataStr(taskDataChars ? taskDataChars : "");

    env->ReleaseStringUTFChars(taskId, taskIdChars);
    env->ReleaseStringUTFChars(taskData, taskDataChars);

    auto descriptor = parseTaskData(taskDataStr);
    auto work = createTaskFunction(descriptor);

    const auto result = g_threadPool->submitTask(taskIdStr, toTaskPriority(priority), std::move(work));
    return env->NewStringUTF(result.c_str());
}

JNIEXPORT jboolean JNICALL
Java_com_threadforge_ThreadForgeModule_nativeCancelTask(JNIEnv* env, jobject, jstring taskId) {
    if (!g_threadPool) {
        return JNI_FALSE;
    }

    const char* taskIdChars = env->GetStringUTFChars(taskId, nullptr);
    std::string taskIdStr(taskIdChars ? taskIdChars : "");
    env->ReleaseStringUTFChars(taskId, taskIdChars);

    return g_threadPool->cancelTask(taskIdStr) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jint JNICALL
Java_com_threadforge_ThreadForgeModule_nativeGetThreadCount(JNIEnv* env, jobject) {
    return g_threadPool ? static_cast<jint>(g_threadPool->getThreadCount()) : 0;
}

JNIEXPORT jint JNICALL
Java_com_threadforge_ThreadForgeModule_nativeGetPendingTaskCount(JNIEnv* env, jobject) {
    return g_threadPool ? static_cast<jint>(g_threadPool->getPendingTaskCount()) : 0;
}

JNIEXPORT jint JNICALL
Java_com_threadforge_ThreadForgeModule_nativeGetActiveTaskCount(JNIEnv* env, jobject) {
    return g_threadPool ? static_cast<jint>(g_threadPool->getActiveTaskCount()) : 0;
}

} // extern "C"
