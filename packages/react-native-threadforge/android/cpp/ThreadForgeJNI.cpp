// Author: Abhishek Kumar
#include <jni.h>

#include <algorithm>
#include <functional>
#include <mutex>
#include <string>

#include "CustomTaskRegistry.h"
#include "TaskUtils.h"

using namespace threadforge;

namespace {

ThreadPool* g_threadPool = nullptr;
JavaVM* g_vm = nullptr;
jclass g_moduleClass = nullptr;
jmethodID g_emitProgress = nullptr;
std::mutex g_emitterMutex;

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
        delete g_threadPool;
    }
    g_threadPool = new ThreadPool(threadCount);
}

} // namespace

extern "C" {

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
    g_vm = vm;
    return JNI_VERSION_1_6;
}

JNIEXPORT void JNICALL
Java_com_threadforge_ThreadForgeModule_nativeInitialize(JNIEnv*, jobject, jint threadCount) {
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

    std::string result;
    try {
        const auto descriptor = parseTaskData(taskDataStr);
        auto work = createTaskFunction(descriptor);
        auto progress = [taskIdStr](double value) {
            const double clamped = std::max(0.0, std::min(1.0, value));
            dispatchProgress(taskIdStr, clamped);
        };
        result = g_threadPool->submitTask(taskIdStr, toTaskPriority(priority), std::move(work), progress);
    } catch (const std::exception& ex) {
        result = std::string("Task error: ") + ex.what();
    } catch (...) {
        result = "Task error: unknown exception";
    }

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
Java_com_threadforge_ThreadForgeModule_nativeGetThreadCount(JNIEnv*, jobject) {
    return g_threadPool ? static_cast<jint>(g_threadPool->getThreadCount()) : 0;
}

JNIEXPORT jint JNICALL
Java_com_threadforge_ThreadForgeModule_nativeGetPendingTaskCount(JNIEnv*, jobject) {
    return g_threadPool ? static_cast<jint>(g_threadPool->getPendingTaskCount()) : 0;
}

JNIEXPORT jint JNICALL
Java_com_threadforge_ThreadForgeModule_nativeGetActiveTaskCount(JNIEnv*, jobject) {
    return g_threadPool ? static_cast<jint>(g_threadPool->getActiveTaskCount()) : 0;
}

JNIEXPORT void JNICALL
Java_com_threadforge_ThreadForgeModule_nativePause(JNIEnv*, jobject) {
    if (g_threadPool) {
        g_threadPool->pause();
    }
}

JNIEXPORT void JNICALL
Java_com_threadforge_ThreadForgeModule_nativeResume(JNIEnv*, jobject) {
    if (g_threadPool) {
        g_threadPool->resume();
    }
}

JNIEXPORT jboolean JNICALL
Java_com_threadforge_ThreadForgeModule_nativeIsPaused(JNIEnv*, jobject) {
    if (!g_threadPool) {
        return JNI_FALSE;
    }
    return g_threadPool->isPaused() ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL
Java_com_threadforge_ThreadForgeModule_nativeSetEventEmitter(JNIEnv* env, jobject thiz) {
    std::lock_guard<std::mutex> lock(g_emitterMutex);
    if (g_moduleClass) {
        return;
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

JNIEXPORT void JNICALL
Java_com_threadforge_ThreadForgeModule_nativeSetConcurrency(JNIEnv* env, jobject, jint threads) {
    if (!g_threadPool) {
        return;
    }
    try {
        g_threadPool->setConcurrency(static_cast<size_t>(std::max(1, threads)));
    } catch (const std::exception& ex) {
        jclass exceptionCls = env->FindClass("java/lang/RuntimeException");
        if (exceptionCls) {
            env->ThrowNew(exceptionCls, ex.what());
        }
    }
}

JNIEXPORT void JNICALL
Java_com_threadforge_ThreadForgeModule_nativeSetQueueLimit(JNIEnv*, jobject, jint limit) {
    if (!g_threadPool) {
        return;
    }
    g_threadPool->setQueueLimit(static_cast<size_t>(std::max(0, limit)));
}

JNIEXPORT jint JNICALL
Java_com_threadforge_ThreadForgeModule_nativeGetQueueLimit(JNIEnv*, jobject) {
    if (!g_threadPool) {
        return 0;
    }
    return static_cast<jint>(g_threadPool->getQueueLimit());
}

JNIEXPORT void JNICALL
Java_com_threadforge_ThreadForgeModule_nativeRegisterTask(JNIEnv* env, jobject, jstring name, jstring definition) {
    const char* nameChars = env->GetStringUTFChars(name, nullptr);
    const char* definitionChars = env->GetStringUTFChars(definition, nullptr);

    std::string nameStr(nameChars ? nameChars : "");
    std::string definitionStr(definitionChars ? definitionChars : "");

    env->ReleaseStringUTFChars(name, nameChars);
    env->ReleaseStringUTFChars(definition, definitionChars);

    try {
        CustomTaskRegistry::instance().registerTask(nameStr, definitionStr);
    } catch (const std::exception& ex) {
        jclass exceptionCls = env->FindClass("java/lang/IllegalArgumentException");
        if (exceptionCls) {
            env->ThrowNew(exceptionCls, ex.what());
        }
    }
}

JNIEXPORT void JNICALL
Java_com_threadforge_ThreadForgeModule_nativeUnregisterTask(JNIEnv* env, jobject, jstring name) {
    const char* nameChars = env->GetStringUTFChars(name, nullptr);
    std::string nameStr(nameChars ? nameChars : "");
    env->ReleaseStringUTFChars(name, nameChars);

    CustomTaskRegistry::instance().unregisterTask(nameStr);
}

JNIEXPORT jstring JNICALL
Java_com_threadforge_ThreadForgeModule_nativeRunRegisteredTask(JNIEnv* env, jobject, jstring taskId, jstring taskName, jint priority, jstring payload) {
    if (!g_threadPool) {
        return env->NewStringUTF("Error: ThreadForge is not initialized");
    }

    const char* taskIdChars = env->GetStringUTFChars(taskId, nullptr);
    const char* nameChars = env->GetStringUTFChars(taskName, nullptr);
    const char* payloadChars = env->GetStringUTFChars(payload, nullptr);

    std::string taskIdStr(taskIdChars ? taskIdChars : "");
    std::string nameStr(nameChars ? nameChars : "");
    std::string payloadStr(payloadChars ? payloadChars : "");

    env->ReleaseStringUTFChars(taskId, taskIdChars);
    env->ReleaseStringUTFChars(taskName, nameChars);
    env->ReleaseStringUTFChars(payload, payloadChars);

    std::string result;
    try {
        auto taskFn = CustomTaskRegistry::instance().createTask(nameStr, payloadStr);
        auto progress = [taskIdStr](double value) {
            const double clamped = std::max(0.0, std::min(1.0, value));
            dispatchProgress(taskIdStr, clamped);
        };
        result = g_threadPool->submitTask(taskIdStr, toTaskPriority(priority), std::move(taskFn), progress);
    } catch (const std::exception& ex) {
        result = std::string("Task error: ") + ex.what();
    } catch (...) {
        result = "Task error: unknown exception";
    }

    return env->NewStringUTF(result.c_str());
}

} // extern "C"
