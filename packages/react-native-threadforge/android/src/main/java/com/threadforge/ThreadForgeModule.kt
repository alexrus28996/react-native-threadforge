package com.threadforge

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = ThreadForgeModule.NAME)
class ThreadForgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ThreadForge"

        init {
            try {
                System.loadLibrary("react-native-threadforge")
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    override fun getName(): String = NAME

    @ReactMethod
    fun initialize(threadCount: Int, promise: Promise) {
        try {
            nativeInitialize(threadCount)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun executeTask(taskId: String, priority: Int, taskData: String, promise: Promise) {
        try {
            val result = nativeExecuteTask(taskId, priority, taskData)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("TASK_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun cancelTask(taskId: String, promise: Promise) {
        try {
            val cancelled = nativeCancelTask(taskId)
            promise.resolve(cancelled)
        } catch (e: Exception) {
            promise.reject("CANCEL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getThreadCount(promise: Promise) {
        try {
            val count = nativeGetThreadCount()
            promise.resolve(count)
        } catch (e: Exception) {
            promise.reject("COUNT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getPendingTaskCount(promise: Promise) {
        try {
            val count = nativeGetPendingTaskCount()
            promise.resolve(count)
        } catch (e: Exception) {
            promise.reject("COUNT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getActiveTaskCount(promise: Promise) {
        try {
            val count = nativeGetActiveTaskCount()
            promise.resolve(count)
        } catch (e: Exception) {
            promise.reject("COUNT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun shutdown(promise: Promise) {
        try {
            nativeShutdown()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SHUTDOWN_ERROR", e.message, e)
        }
    }

    // Native methods
    private external fun nativeInitialize(threadCount: Int)
    private external fun nativeExecuteTask(taskId: String, priority: Int, taskData: String): String
    private external fun nativeCancelTask(taskId: String): Boolean
    private external fun nativeGetThreadCount(): Int
    private external fun nativeGetPendingTaskCount(): Int
    private external fun nativeGetActiveTaskCount(): Int
    private external fun nativeShutdown()
}