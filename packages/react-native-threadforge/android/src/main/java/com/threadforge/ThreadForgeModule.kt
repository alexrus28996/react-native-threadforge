package com.threadforge

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

@ReactModule(name = ThreadForgeModule.NAME)
class ThreadForgeModule(private val appContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(appContext) {

    private val executor: ExecutorService = Executors.newCachedThreadPool()

    companion object {
        const val NAME = "ThreadForge"
        private const val PROGRESS_EVENT = "threadforge_progress"

        private var reactContext: ReactApplicationContext? = null

        init {
            try {
                System.loadLibrary("react-native-threadforge")
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        @JvmStatic
        fun setReactContext(context: ReactApplicationContext?) {
            reactContext = context
        }

        @JvmStatic
        fun emitProgress(taskId: String, progress: Double) {
            val context = reactContext ?: return
            val params = Arguments.createMap().apply {
                putString("taskId", taskId)
                putDouble("progress", progress)
            }
            context.getJSModule(RCTDeviceEventEmitter::class.java)
                .emit(PROGRESS_EVENT, params)
        }
    }

    override fun getName(): String = NAME

    override fun invalidate() {
        super.invalidate()
        executor.shutdownNow()
        nativeClearEventEmitter()
        setReactContext(null)
    }

    init {
        setReactContext(appContext)
        nativeSetEventEmitter()
    }

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
        executor.execute {
            try {
                val result = nativeExecuteTask(taskId, priority, taskData)
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("TASK_ERROR", e.message, e)
            }
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
    fun pause(promise: Promise) {
        try {
            nativePause()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("PAUSE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun resume(promise: Promise) {
        try {
            nativeResume()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RESUME_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isPaused(promise: Promise) {
        try {
            val paused = nativeIsPaused()
            promise.resolve(paused)
        } catch (e: Exception) {
            promise.reject("STATE_ERROR", e.message, e)
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
    fun setConcurrency(threadCount: Int, promise: Promise) {
        try {
            nativeSetConcurrency(threadCount)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CONCURRENCY_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setQueueLimit(limit: Int, promise: Promise) {
        try {
            nativeSetQueueLimit(limit)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("QUEUE_LIMIT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getQueueLimit(promise: Promise) {
        try {
            val limit = nativeGetQueueLimit()
            promise.resolve(limit)
        } catch (e: Exception) {
            promise.reject("QUEUE_LIMIT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN EventEmitter compatibility. No-op because events are
        // dispatched via RCTDeviceEventEmitter directly.
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN EventEmitter compatibility.
    }

    @ReactMethod
    fun registerTask(name: String, definition: String, promise: Promise) {
        try {
            nativeRegisterTask(name, definition)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("REGISTER_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun unregisterTask(name: String, promise: Promise) {
        try {
            nativeUnregisterTask(name)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("REGISTER_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun runRegisteredTask(taskId: String, name: String, priority: Int, payload: String?, promise: Promise) {
        executor.execute {
            try {
                val result = nativeRunRegisteredTask(taskId, name, priority, payload ?: "")
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("TASK_ERROR", e.message, e)
            }
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
    private external fun nativePause()
    private external fun nativeResume()
    private external fun nativeIsPaused(): Boolean
    private external fun nativeGetThreadCount(): Int
    private external fun nativeGetPendingTaskCount(): Int
    private external fun nativeGetActiveTaskCount(): Int
    private external fun nativeSetEventEmitter()
    private external fun nativeClearEventEmitter()
    private external fun nativeSetConcurrency(threadCount: Int)
    private external fun nativeSetQueueLimit(limit: Int)
    private external fun nativeGetQueueLimit(): Int
    private external fun nativeRegisterTask(name: String, definition: String)
    private external fun nativeUnregisterTask(name: String)
    private external fun nativeRunRegisteredTask(taskId: String, name: String, priority: Int, payload: String): String
    private external fun nativeShutdown()
}