// Author: Abhishek Kumar <alexrus28996@gmail.com>
#include <jni.h>

#include <algorithm>
#include <chrono>
#include <functional>
#include <mutex>
#include <string>

#include "FunctionExecutor.h"
#include "TaskResult.h"
#include "ThreadPool.h"
#include "nlohmann/json.hpp"

using namespace threadforge;

namespace {

constexpr auto kProgressThrottle = std::chrono::milliseconds(100);

ThreadPool* g_threadPool = nullptr;
JavaVM* g_vm = nullptr;
jclass g_moduleClass = nullptr;
jmethodID g_emitProgress = nullptr;
std::mutex g_emitterMutex;

class ScopedJniEnv {
public:
    explicit ScopedJniEnv(JavaVM* vm)
        : vm_(vm) {
        if (!vm_) {
            return;
        }

        if (vm_->GetEnv(reinterpret_cast<void**>(&env_), JNI_VERSION_1_6) == JNI_OK && env_) {
            attached_ = false;
            return;
        }

        if (vm_->AttachCurrentThread(&env_, nullptr) == JNI_OK && env_) {
            attached_ = true;
        } else {
            env_ = nullptr;
        }
    }

    ScopedJniEnv(const ScopedJniEnv&) = delete;
    ScopedJniEnv& operator=(const ScopedJniEnv&) = delete;

    ~ScopedJniEnv() {
        if (attached_ && vm_) {
            vm_->DetachCurrentThread();
        }
    }

    [[nodiscard]] JNIEnv* get() const {
        return env_;
    }

    [[nodiscard]] bool valid() const {
        return env_ != nullptr;
    }

private:
    JavaVM* vm_;
    JNIEnv* env_{nullptr};
    bool attached_{false};
};

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

void dispatchProgress(const std::string& taskId, double progress) {
    std::lock_guard<std::mutex> lock(g_emitterMutex);
    if (!g_vm || !g_moduleClass || !g_emitProgress) {
        return;
    }

    JNIEnv* env = nullptr;
    bool attached = false;
    if (g_vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK) {
        if (g_vm->AttachCurrentThread(&env, nullptr) != JNI_OK || !env) {
            return;
        }
        attached = true;
    }

    jstring jTaskId = env->NewStringUTF(taskId.c_str());
    env->CallStaticVoidMethod(g_moduleClass, g_emitProgress, jTaskId, static_cast<jdouble>(progress));
    env->DeleteLocalRef(jTaskId);

    if (env->ExceptionCheck()) {
        env->ExceptionClear();
    }

    if (attached) {
        g_vm->DetachCurrentThread();
    }
}

void ensureThreadPool(size_t threadCount) {
    if (g_threadPool) {
        g_threadPool->shutdown();
        delete g_threadPool;
        g_threadPool = nullptr;
    }
    g_threadPool = new ThreadPool(threadCount);
}

std::string makeStatsPayload() {
    if (!g_threadPool) {
        return std::string("{\"threadCount\":0,\"pending\":0,\"active\":0}");
    }
    nlohmann::json json;
    json["threadCount"] = g_threadPool->getThreadCount();
    json["pending"] = g_threadPool->getPendingTaskCount();
    json["active"] = g_threadPool->getActiveTaskCount();
    return json.dump();
}

} // namespace

extern "C" {

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
    g_vm = vm;
    return JNI_VERSION_1_6;
}

JNIEXPORT void JNICALL
Java_com_threadforge_ThreadForgeModule_nativeInitialize(JNIEnv* env, jobject, jint threadCount) {
    if (!g_vm && env) {
        JavaVM* vm = nullptr;
        if (env->GetJavaVM(&vm) == JNI_OK) {
            g_vm = vm;
        }
    }
    ensureThreadPool(static_cast<size_t>(std::max(1, threadCount)));
}

JNIEXPORT void JNICALL
Java_com_threadforge_ThreadForgeModule_nativeShutdown(JNIEnv*, jobject) {
    if (g_threadPool) {
        g_threadPool->shutdown();
        delete g_threadPool;
        g_threadPool = nullptr;
    }
}

JNIEXPORT jstring JNICALL
Java_com_threadforge_ThreadForgeModule_nativeRunFunction(JNIEnv* env, jobject, jstring taskId, jint priority, jstring source) {
    if (!g_threadPool) {
        auto error = serializeTaskResult(makeErrorResult("ThreadForge is not initialized"));
        return env->NewStringUTF(error.c_str());
    }

    const char* taskIdChars = env->GetStringUTFChars(taskId, nullptr);
    const char* sourceChars = env->GetStringUTFChars(source, nullptr);

    std::string taskIdStr(taskIdChars ? taskIdChars : "");
    std::string sourceStr(sourceChars ? sourceChars : "");

    env->ReleaseStringUTFChars(taskId, taskIdChars);
    env->ReleaseStringUTFChars(source, sourceChars);

    TaskResult result;
    try {
        auto progress = [taskIdStr](double value) {
            const double clamped = std::max(0.0, std::min(1.0, value));
            dispatchProgress(taskIdStr, clamped);
        };
        auto work = [taskIdStr, sourceStr](const ProgressCallback& progressCallback,
                                           const std::function<bool()>& isCancelled) {
            ScopedJniEnv envScope(g_vm);
            if (!envScope.valid()) {
                return makeErrorResult("Unable to retrieve JNIEnv*.");
            }
            return runSerializedFunction(taskIdStr,
                                         sourceStr,
                                         progressCallback,
                                         kProgressThrottle,
                                         isCancelled);
        };
        result = g_threadPool->submitTask(taskIdStr,
                                          toTaskPriority(priority),
                                          std::move(work),
                                          progress);
    } catch (const std::exception& ex) {
        result = makeErrorResult(ex.what());
    } catch (...) {
        result = makeErrorResult("Unknown error while executing ThreadForge task");
    }

    const auto payload = serializeTaskResult(result);
    return env->NewStringUTF(payload.c_str());
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

JNIEXPORT jstring JNICALL
Java_com_threadforge_ThreadForgeModule_nativeGetStats(JNIEnv* env, jobject) {
    const auto payload = makeStatsPayload();
    return env->NewStringUTF(payload.c_str());
}

JNIEXPORT void JNICALL
Java_com_threadforge_ThreadForgeModule_nativeSetEventEmitter(JNIEnv* env, jobject thiz) {
    std::lock_guard<std::mutex> lock(g_emitterMutex);
    if (g_moduleClass) {
        return;
    }
    if (!g_vm && env) {
        JavaVM* vm = nullptr;
        if (env->GetJavaVM(&vm) == JNI_OK) {
            g_vm = vm;
        }
    }
    jclass cls = env->GetObjectClass(thiz);
    g_moduleClass = static_cast<jclass>(env->NewGlobalRef(cls));
    env->DeleteLocalRef(cls);
    if (g_moduleClass) {
        g_emitProgress = env->GetStaticMethodID(g_moduleClass, "emitProgress", "(Ljava/lang/String;D)V");
    }
}

JNIEXPORT void JNICALL
Java_com_threadforge_ThreadForgeModule_nativeClearEventEmitter(JNIEnv* env, jobject) {
    std::lock_guard<std::mutex> lock(g_emitterMutex);
    if (g_moduleClass) {
        env->DeleteGlobalRef(g_moduleClass);
        g_moduleClass = nullptr;
        g_emitProgress = nullptr;
    }
}

} // extern "C"
