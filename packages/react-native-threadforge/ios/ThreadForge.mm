// Author: Abhishek Kumar
#import "ThreadForge.h"

#import <algorithm>
#import <functional>
#import <memory>
#import <mutex>
#import <string>

#import "CustomTaskRegistry.h"
#import "TaskUtils.h"

using namespace threadforge;

namespace {
std::shared_ptr<ThreadPool> gThreadPool;
std::mutex gMutex;
std::function<void(const std::string&, double)> gProgressEmitter;

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

} // namespace

@implementation ThreadForge

RCT_EXPORT_MODULE()

- (NSArray<NSString *> *)supportedEvents {
  return @[ @"threadforge_progress" ];
}

- (void)startObserving {
  __weak typeof(self) weakSelf = self;
  std::lock_guard<std::mutex> lock(gMutex);
  gProgressEmitter = [weakSelf](const std::string &taskId, double progress) {
    __strong typeof(weakSelf) strongSelf = weakSelf;
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
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  std::lock_guard<std::mutex> lock(gMutex);
  try {
    gThreadPool = std::make_shared<ThreadPool>(std::max(1, [threadCount intValue]));
    resolve(@(YES));
  } catch (const std::exception &ex) {
    reject(@"E_INIT", [NSString stringWithUTF8String:ex.what()], nil);
  }
}

RCT_REMAP_METHOD(executeTask,
                 executeTaskWithId:(NSString *)taskId
                 priority:(nonnull NSNumber *)priority
                 payload:(NSString *)payload
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  auto threadPool = acquireThreadPool(reject);
  if (!threadPool) {
    return;
  }

  try {
    const auto descriptor = parseTaskData(safeString(payload));
    auto work = createTaskFunction(descriptor);
    std::string taskIdentifier = safeString(taskId);
    auto progress = [taskIdentifier](double value) {
      const double clamped = std::max(0.0, std::min(1.0, value));
      std::lock_guard<std::mutex> lock(gMutex);
      if (gProgressEmitter) {
        gProgressEmitter(taskIdentifier, clamped);
      }
    };
    const auto result = threadPool->submitTask(taskIdentifier, toTaskPriority([priority intValue]), std::move(work), progress);

    resolve([NSString stringWithUTF8String:result.c_str()]);
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

RCT_REMAP_METHOD(pause,
                 pauseWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  auto threadPool = acquireThreadPool(reject);
  if (!threadPool) {
    return;
  }

  threadPool->pause();
  resolve(@(YES));
}

RCT_REMAP_METHOD(resume,
                 resumeWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  auto threadPool = acquireThreadPool(reject);
  if (!threadPool) {
    return;
  }

  threadPool->resume();
  resolve(@(YES));
}

RCT_REMAP_METHOD(isPaused,
                 isPausedWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  auto threadPool = acquireThreadPool(reject);
  if (!threadPool) {
    return;
  }

  resolve(@(threadPool->isPaused()));
}

RCT_REMAP_METHOD(getThreadCount,
                 threadCountWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  auto threadPool = acquireThreadPool(reject);
  if (!threadPool) {
    return;
  }

  resolve(@(threadPool->getThreadCount()));
}

RCT_REMAP_METHOD(getPendingTaskCount,
                 pendingTaskCountWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  auto threadPool = acquireThreadPool(reject);
  if (!threadPool) {
    return;
  }

  resolve(@(threadPool->getPendingTaskCount()));
}

RCT_REMAP_METHOD(getActiveTaskCount,
                 activeTaskCountWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  auto threadPool = acquireThreadPool(reject);
  if (!threadPool) {
    return;
  }

  resolve(@(threadPool->getActiveTaskCount()));
}

RCT_REMAP_METHOD(registerTask,
                 registerTaskWithName:(NSString *)name
                 definition:(NSString *)definition
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  try {
    CustomTaskRegistry::instance().registerTask(safeString(name), safeString(definition));
    resolve(@(YES));
  } catch (const std::exception &ex) {
    reject(@"E_REGISTER", [NSString stringWithUTF8String:ex.what()], nil);
  }
}

RCT_REMAP_METHOD(unregisterTask,
                 unregisterTaskWithName:(NSString *)name
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  CustomTaskRegistry::instance().unregisterTask(safeString(name));
  resolve(@(YES));
}

RCT_REMAP_METHOD(runRegisteredTask,
                 runRegisteredTaskWithId:(NSString *)taskId
                 name:(NSString *)taskName
                 priority:(nonnull NSNumber *)priority
                 payload:(NSString *)payload
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  auto threadPool = acquireThreadPool(reject);
  if (!threadPool) {
    return;
  }

  try {
    auto taskFn = CustomTaskRegistry::instance().createTask(safeString(taskName), safeString(payload));
    std::string taskIdentifier = safeString(taskId);
    auto progress = [taskIdentifier](double value) {
      const double clamped = std::max(0.0, std::min(1.0, value));
      std::lock_guard<std::mutex> lock(gMutex);
      if (gProgressEmitter) {
        gProgressEmitter(taskIdentifier, clamped);
      }
    };
    const auto result = threadPool->submitTask(taskIdentifier, toTaskPriority([priority intValue]), std::move(taskFn), progress);
    resolve([NSString stringWithUTF8String:result.c_str()]);
  } catch (const std::exception &ex) {
    reject(@"E_TASK", [NSString stringWithUTF8String:ex.what()], nil);
  } catch (...) {
    reject(@"E_TASK", @"Unknown task error", nil);
  }
}

RCT_REMAP_METHOD(setConcurrency,
                 setConcurrencyWithThreadCount:(nonnull NSNumber *)threadCount
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  auto threadPool = acquireThreadPool(reject);
  if (!threadPool) {
    return;
  }

  try {
    threadPool->setConcurrency(std::max(1, [threadCount intValue]));
    resolve(@(YES));
  } catch (const std::exception &ex) {
    reject(@"E_CONCURRENCY", [NSString stringWithUTF8String:ex.what()], nil);
  }
}

RCT_REMAP_METHOD(setQueueLimit,
                 setQueueLimitWithValue:(nonnull NSNumber *)limit
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  auto threadPool = acquireThreadPool(reject);
  if (!threadPool) {
    return;
  }

  threadPool->setQueueLimit(std::max(0, [limit intValue]));
  resolve(@(YES));
}

RCT_REMAP_METHOD(getQueueLimit,
                 getQueueLimitWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  auto threadPool = acquireThreadPool(reject);
  if (!threadPool) {
    return;
  }

  resolve(@(threadPool->getQueueLimit()));
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
