// Author: Abhishek Kumar <alexrus28996@gmail.com>
package com.threadforge

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import org.json.JSONObject

@ReactModule(name = ThreadForgeModule.NAME)
class ThreadForgeModule(private val appContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(appContext) {

    private val executor: ExecutorService = Executors.newCachedThreadPool()
    private val mainHandler = Handler(Looper.getMainLooper())

    companion object {
        const val NAME = "ThreadForge"
        private const val PROGRESS_EVENT = "threadforge_progress"

        private var reactContext: ReactApplicationContext? = null
        private val hermesCheckLock = Any()
        @Volatile
        private var hermesAvailable: Boolean? = null
        @Volatile
        private var hermesMissingCause: Throwable? = null

        private fun isHermesAvailable(): Boolean {
            val cached = hermesAvailable
            if (cached != null) {
                return cached
            }

            synchronized(hermesCheckLock) {
                val existing = hermesAvailable
                if (existing != null) {
                    return existing
                }

                return try {
                    Class.forName("com.facebook.hermes.reactexecutor.HermesExecutor")
                    hermesAvailable = true
                    true
                } catch (error: ClassNotFoundException) {
                    hermesMissingCause = error
                    hermesAvailable = false
                    false
                }
            }
        }

        private fun requireHermes() {
            if (!isHermesAvailable()) {
                throw IllegalStateException(
                    "ThreadForge requires the Hermes JS engine on Android. " +
                        "Set hermesEnabled=true in android/gradle.properties and " +
                        "add the com.facebook.react:hermes-android dependency to your app.",
                    hermesMissingCause,
                )
            }
        }

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
            context.runOnUiQueueThread {
                context.getJSModule(RCTDeviceEventEmitter::class.java)
                    .emit(PROGRESS_EVENT, params)
            }
        }
    }

    override fun getName(): String = NAME

    override fun invalidate() {
        super.invalidate()
        executor.shutdownNow()
        mainHandler.removeCallbacksAndMessages(null)
        nativeClearEventEmitter()
        setReactContext(null)
    }

    init {
        requireHermes()
        setReactContext(appContext)
        nativeSetEventEmitter()
    }

    @ReactMethod
    fun initialize(threadCount: Int, promise: Promise) {
        try {
            requireHermes()
            nativeInitialize(threadCount)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun runFunction(taskId: String, priority: Int, source: String, promise: Promise) {
        executor.execute {
            try {
                requireHermes()
                val result = nativeRunFunction(taskId, priority, source)
                deliverPromise { promise.resolve(result) }
            } catch (e: Exception) {
                deliverPromise { promise.reject("TASK_ERROR", e.message, e) }
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
    fun getStats(promise: Promise) {
        try {
            val payload = nativeGetStats() ?: "{}"
            val json = JSONObject(payload)
            val map = Arguments.createMap().apply {
                putInt("threadCount", json.optInt("threadCount"))
                putInt("pending", json.optInt("pending"))
                putInt("active", json.optInt("active"))
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("STATS_ERROR", e.message, e)
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

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN EventEmitter compatibility. No-op because events are
        // dispatched via RCTDeviceEventEmitter directly.
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN EventEmitter compatibility.
    }

    private fun deliverPromise(action: () -> Unit) {
        val deliver = Runnable {
            try {
                action()
            } catch (error: RuntimeException) {
                Log.e(NAME, "Failed to deliver ThreadForge promise", error)
            }
        }
        if (Looper.myLooper() == Looper.getMainLooper()) {
            deliver.run()
        } else {
            mainHandler.post(deliver)
        }
    }

    private external fun nativeInitialize(threadCount: Int)
    private external fun nativeRunFunction(taskId: String, priority: Int, source: String): String
    private external fun nativeCancelTask(taskId: String): Boolean
    private external fun nativeGetStats(): String
    private external fun nativeSetEventEmitter()
    private external fun nativeClearEventEmitter()
    private external fun nativeShutdown()
}
