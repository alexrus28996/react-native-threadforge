#include <android/log.h>
#include <jni.h>
#include <math.h>
#include <functional>
#include <string>

#include "TaskUtils.h"

#define LOG_TAG "ThreadForge"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

using namespace threadforge;

static ThreadPool* g_threadPool = nullptr;

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

    std::string result;
    try {
        const auto descriptor = parseTaskData(taskDataStr);
        auto work = createTaskFunction(descriptor);
        result = g_threadPool->submitTask(taskIdStr, toTaskPriority(priority), std::move(work));
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

JNIEXPORT void JNICALL
Java_com_threadforge_ThreadForgeModule_nativePause(JNIEnv* env, jobject) {
    if (g_threadPool) {
        g_threadPool->pause();
    }
}

JNIEXPORT void JNICALL
Java_com_threadforge_ThreadForgeModule_nativeResume(JNIEnv* env, jobject) {
    if (g_threadPool) {
        g_threadPool->resume();
    }
}

JNIEXPORT jboolean JNICALL
Java_com_threadforge_ThreadForgeModule_nativeIsPaused(JNIEnv* env, jobject) {
    if (!g_threadPool) {
        return JNI_FALSE;
    }
    return g_threadPool->isPaused() ? JNI_TRUE : JNI_FALSE;
}

} // extern "C"
