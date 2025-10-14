#import "ThreadForge.h"

#import <React/RCTLog.h>

#import <algorithm>
#import <memory>
#import <mutex>
#import <string>

#import "TaskUtils.h"

using namespace threadforge;

namespace {
std::shared_ptr<ThreadPool> gThreadPool;
std::mutex gMutex;

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

- (dispatch_queue_t)methodQueue {
  return threadForgeQueue();
}

- (void)invalidate {
  std::lock_guard<std::mutex> lock(gMutex);
  if (gThreadPool) {
    gThreadPool->shutdown();
    gThreadPool.reset();
  }
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

  const auto descriptor = parseTaskData(safeString(payload));
  auto work = createTaskFunction(descriptor);
  const auto result = threadPool->submitTask(safeString(taskId), toTaskPriority([priority intValue]), std::move(work));

  resolve([NSString stringWithUTF8String:result.c_str()]);
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

RCT_REMAP_METHOD(shutdown,
                 shutdownWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  std::lock_guard<std::mutex> lock(gMutex);
  if (gThreadPool) {
    gThreadPool->shutdown();
    gThreadPool.reset();
  }

  resolve(@(YES));
}

@end
