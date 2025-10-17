// Author: Abhishek Kumar <alexrus28996@gmail.com>
#import "ThreadForge.h"

#import <algorithm>
#import <chrono>
#import <functional>
#import <memory>
#import <mutex>
#import <string>

#import "FunctionExecutor.h"
#import "TaskResult.h"
#import "ThreadPool.h"

using namespace threadforge;

namespace {
std::shared_ptr<ThreadPool> gThreadPool;
std::mutex gMutex;
std::function<void(const std::string&, double)> gProgressEmitter;
std::chrono::milliseconds gProgressThrottle = std::chrono::milliseconds(100);

TaskPriority toTaskPriority(NSInteger priority) {
  switch (priority) {
    case 2:
      return TaskPriority::HIGH;
    case 0:
      return TaskPriority::LOW;
    default:
      return TaskPriority::NORMAL;
  }
}

dispatch_queue_t threadForgeQueue() {
  static dispatch_once_t onceToken;
  static dispatch_queue_t queue;
  dispatch_once(&onceToken, ^{
    queue = dispatch_queue_create("com.threadforge.queue", DISPATCH_QUEUE_SERIAL);
  });
  return queue;
}

std::string safeString(NSString *value) {
  if (!value) {
    return std::string();
  }
  const char *utf8String = [value UTF8String];
  return utf8String ? std::string(utf8String) : std::string();
}

std::shared_ptr<ThreadPool> acquireThreadPool(RCTPromiseRejectBlock reject) {
  std::lock_guard<std::mutex> lock(gMutex);
  if (!gThreadPool) {
    if (reject) {
      reject(@"E_NOT_INITIALIZED", @"ThreadForge has not been initialized", nil);
    }
    return nullptr;
  }
  return gThreadPool;
}

std::chrono::milliseconds currentProgressThrottle() {
  std::lock_guard<std::mutex> lock(gMutex);
  return gProgressThrottle;
}

} // namespace

@implementation ThreadForge

RCT_EXPORT_MODULE()

- (NSArray<NSString *> *)supportedEvents {
  return @[ @"threadforge_progress" ];
}

- (void)startObserving {
  __weak __typeof(self) weakSelf = self;
  std::lock_guard<std::mutex> lock(gMutex);
  gProgressEmitter = [weakSelf](const std::string &taskId, double progress) {
    __typeof(self) strongSelf = weakSelf;
    if (!strongSelf) {
      return;
    }
    NSString *taskIdString = [NSString stringWithUTF8String:taskId.c_str()];
    NSNumber *progressNumber = @(progress);
    dispatch_async(dispatch_get_main_queue(), ^{
      [strongSelf sendEventWithName:@"threadforge_progress"
                               body:@{ @"taskId" : taskIdString ?: @"",
                                       @"progress" : progressNumber }];
    });
  };
}

- (void)stopObserving {
  std::lock_guard<std::mutex> lock(gMutex);
  gProgressEmitter = nullptr;
}

- (dispatch_queue_t)methodQueue {
  return threadForgeQueue();
}

- (void)invalidate {
  std::lock_guard<std::mutex> lock(gMutex);
  if (gThreadPool) {
    gThreadPool->shutdown();
    gThreadPool.reset();
  }
  gProgressEmitter = nullptr;
}

RCT_REMAP_METHOD(initialize,
                 initializeWithThreadCount:(nonnull NSNumber *)threadCount
                 progressThrottleMs:(nonnull NSNumber *)progressThrottleMs
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  std::lock_guard<std::mutex> lock(gMutex);
  try {
    const auto sanitizedThrottle = std::max(0, [progressThrottleMs intValue]);
    gProgressThrottle = std::chrono::milliseconds(sanitizedThrottle);
    gThreadPool = std::make_shared<ThreadPool>(std::max(1, [threadCount intValue]));
    resolve(@(YES));
  } catch (const std::exception &ex) {
    reject(@"E_INIT", [NSString stringWithUTF8String:ex.what()], nil);
  }
}

RCT_REMAP_METHOD(runFunction,
                 runFunctionWithId:(NSString *)taskId
                 priority:(nonnull NSNumber *)priority
                 source:(NSString *)source
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  auto threadPool = acquireThreadPool(reject);
  if (!threadPool) {
    return;
  }

  try {
    std::string taskIdentifier = safeString(taskId);
    std::string functionSource = safeString(source);
    auto progress = [taskIdentifier](double value) {
      const double clamped = std::max(0.0, std::min(1.0, value));
      std::lock_guard<std::mutex> lock(gMutex);
      if (gProgressEmitter) {
        gProgressEmitter(taskIdentifier, clamped);
      }
    };

    const auto progressThrottle = currentProgressThrottle();
    auto work = [taskIdentifier, functionSource, progressThrottle](
                   const ProgressCallback &progressCallback,
                   const std::function<bool()> &isCancelled) {
      return runSerializedFunction(taskIdentifier,
                                   functionSource,
                                   progressCallback,
                                   progressThrottle,
                                   isCancelled);
    };

    const auto result = threadPool->submitTask(taskIdentifier,
                                               toTaskPriority([priority intValue]),
                                               std::move(work),
                                               progress);
    const auto payload = serializeTaskResult(result);
    resolve([NSString stringWithUTF8String:payload.c_str()]);
  } catch (const std::exception &ex) {
    reject(@"E_TASK", [NSString stringWithUTF8String:ex.what()], nil);
  } catch (...) {
    reject(@"E_TASK", @"Unknown task error", nil);
  }
}

RCT_REMAP_METHOD(cancelTask,
                 cancelTaskWithId:(NSString *)taskId
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  auto threadPool = acquireThreadPool(reject);
  if (!threadPool) {
    return;
  }

  const bool cancelled = threadPool->cancelTask(safeString(taskId));
  resolve(@(cancelled));
}

RCT_REMAP_METHOD(getStats,
                 getStatsWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  auto threadPool = acquireThreadPool(reject);
  if (!threadPool) {
    return;
  }

  resolve(@{
    @"threadCount" : @(threadPool->getThreadCount()),
    @"pending" : @(threadPool->getPendingTaskCount()),
    @"active" : @(threadPool->getActiveTaskCount()),
  });
}

RCT_REMAP_METHOD(shutdown,
                 shutdownWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  std::lock_guard<std::mutex> lock(gMutex);
  if (gThreadPool) {
    gThreadPool->shutdown();
    gThreadPool.reset();
  }
  gProgressEmitter = nullptr;

  resolve(@(YES));
}

@end
