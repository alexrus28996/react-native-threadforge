#include <jni.h>
#include <string>
#include "ThreadPool.h"
#include <android/log.h>

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

JNIEXPORT jint JNICALL
Java_com_threadforge_ThreadForgeModule_nativeGetThreadCount(JNIEnv* env, jobject) {
    return g_threadPool ? g_threadPool->getThreadCount() : 0;
}

}