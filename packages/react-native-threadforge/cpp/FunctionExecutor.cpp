#include "FunctionExecutor.h"

#include <algorithm>
#include <chrono>
#include <jsi/jsi.h>
#include <memory>
#include <stdexcept>

#if __has_include(<hermes/hermes.h>)
#include <hermes/hermes.h>
#elif __has_include(<hermes-engine/hermes/hermes.h>)
#include <hermes-engine/hermes/hermes.h>
#else
namespace facebook::hermes {
inline std::unique_ptr<facebook::jsi::Runtime> makeHermesRuntime() {
    throw std::runtime_error(
        "ThreadForge requires the Hermes JavaScript engine on Android. "
        "Please enable Hermes in your React Native configuration or install "
        "the hermes-engine dependency.");
}
} // namespace facebook::hermes
#endif

namespace threadforge {

namespace {

using facebook::hermes::makeHermesRuntime;
using facebook::jsi::Function;
using facebook::jsi::JSError;
using facebook::jsi::PropNameID;
using facebook::jsi::Runtime;
using facebook::jsi::StringBuffer;
using facebook::jsi::Value;

class SimpleStringBuffer : public StringBuffer {
public:
    explicit SimpleStringBuffer(std::string source)
        : StringBuffer(std::move(source)) {}
};
} // namespace

TaskResult runSerializedFunction(const std::string& taskId,
                                 const std::string& functionSource,
                                 const std::function<void(double)>& progressEmitter,
                                 std::chrono::milliseconds progressThrottle,
                                 const std::function<bool()>& isCancelled) {
    if (isCancelled && isCancelled()) {
        return makeCancelledResult();
    }

    try {
        auto runtime = makeHermesRuntime();
        Runtime& rt = *runtime;

        auto lastEmission = std::make_shared<std::chrono::steady_clock::time_point>(
            std::chrono::steady_clock::now() - progressThrottle);

        auto throttledEmitter = progressEmitter;
        auto progressFn = Function::createFromHostFunction(
            rt,
            PropNameID::forAscii(rt, "reportProgress"),
            1,
            [throttledEmitter, lastEmission, progressThrottle](Runtime& runtime,
                                                                const Value&,
                                                                const Value* args,
                                                                size_t count) -> Value {
                if (!throttledEmitter) {
                    return Value::undefined();
                }
                if (count == 0) {
                    return Value::undefined();
                }
                double value = 0.0;
                if (args[0].isNumber()) {
                    value = args[0].asNumber();
                }
                value = std::clamp(value, 0.0, 1.0);
                const auto now = std::chrono::steady_clock::now();
                if (progressThrottle.count() == 0 || now - *lastEmission >= progressThrottle) {
                    *lastEmission = now;
                    throttledEmitter(value);
                }
                return Value::undefined();
            });
        rt.global().setProperty(rt, "reportProgress", progressFn);

        auto cancellationFn = Function::createFromHostFunction(
            rt,
            PropNameID::forAscii(rt, "shouldCancel"),
            0,
            [isCancelled](Runtime& runtime, const Value&, const Value*, size_t) -> Value {
                if (isCancelled && isCancelled()) {
                    return Value(true);
                }
                return Value(false);
            });
        rt.global().setProperty(rt, "shouldCancel", cancellationFn);

        auto wrappedSource = std::string("(function(){\n") +
            "  const fn = (" + functionSource + ");\n" +
            "  if (typeof fn !== 'function') {\n" +
            "    throw new Error('ThreadForge runFunction expects a function.');\n" +
            "  }\n" +
            "  const result = fn();\n" +
            "  if (result && typeof result.then === 'function') {\n" +
            "    throw new Error('ThreadForge runFunction does not support async functions.');\n" +
            "  }\n" +
            "  return JSON.stringify({ value: result ?? null });\n" +
            "})()";

        auto resultValue = runtime->evaluateJavaScript(std::make_unique<SimpleStringBuffer>(wrappedSource),
                                                       taskId.empty() ? "ThreadForgeTask" : taskId);
        if (!resultValue.isString()) {
            return makeErrorResult("ThreadForge task did not return a serializable result");
        }

        const auto json = resultValue.getString(rt).utf8(rt);
        if (progressEmitter) {
            progressEmitter(1.0);
        }

        if (isCancelled && isCancelled()) {
            auto cancelled = makeCancelledResult();
            cancelled.valueJson = json;
            return cancelled;
        }

        return makeSuccessResult(json);
    } catch (const JSError& error) {
        auto message = error.getMessage();
        auto stack = error.getStack();
        return makeErrorResult(message, stack);
    } catch (const std::exception& ex) {
        return makeErrorResult(ex.what());
    } catch (...) {
        return makeErrorResult("Unknown error while executing ThreadForge function");
    }
}

} // namespace threadforge
