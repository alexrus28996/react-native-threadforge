#include "ThreadPool.h"

#include <algorithm>
#include <stdexcept>

namespace threadforge {

ThreadPool::ThreadPool(size_t numThreads) {
    const size_t clamped = std::max<size_t>(1, numThreads);
    for (size_t i = 0; i < clamped; ++i) {
        workers.emplace_back([this] { this->workerThread(); });
    }
}

ThreadPool::~ThreadPool() {
    shutdown();
}

void ThreadPool::workerThread() {
    while (true) {
        std::shared_ptr<Task> task;

        {
            std::unique_lock<std::mutex> lock(queueMutex);
            condition.wait(lock, [this] {
                return stop || (!paused && !tasks.empty());
            });

            if (stop && tasks.empty()) {
                return;
            }

            task = tasks.top();
            tasks.pop();
            pendingTasks--;

            if (task->cancelled) {
                taskMap.erase(task->id);
                {
                    std::lock_guard<std::mutex> taskLock(task->mutex);
                    task->result = makeCancelledResult();
                    task->hasResult = true;
                    task->finished = true;
                }
                task->completionCv.notify_all();
                continue;
            }

            activeTasks++;
        }

        TaskResult taskResult;
        bool hasLocalResult = false;
        try {
            auto progressEmitter = task->progress;
            if (!progressEmitter) {
                progressEmitter = [](double) {};
            }
            auto cancellationCheck = [task]() {
                return task->cancelled.load();
            };
            taskResult = task->work(progressEmitter, cancellationCheck);
            hasLocalResult = true;
        } catch (const std::exception& ex) {
            taskResult = makeErrorResult(ex.what());
            hasLocalResult = true;
        } catch (...) {
            taskResult = makeErrorResult("Unknown exception while executing ThreadForge task");
            hasLocalResult = true;
        }

        {
            std::lock_guard<std::mutex> lock(queueMutex);
            taskMap.erase(task->id);
            activeTasks--;
        }

        {
            std::lock_guard<std::mutex> taskLock(task->mutex);
            if (!task->finished) {
                if (task->cancelled) {
                    taskResult.cancelled = true;
                    taskResult.success = false;
                    if (taskResult.errorMessage.empty()) {
                        taskResult.errorMessage = "Task cancelled";
                    }
                    taskResult.valueJson.clear();
                } else if (!hasLocalResult) {
                    taskResult = makeErrorResult("ThreadForge task completed without result");
                }
                task->result = std::move(taskResult);
                task->hasResult = true;
                task->finished = true;
            }
        }

        task->completionCv.notify_all();
    }
}

TaskResult ThreadPool::submitTask(const std::string& taskId, TaskPriority priority, TaskFunction task, ProgressCallback progress) {
    auto sequence = sequenceCounter.fetch_add(1);
    auto taskObj = std::make_shared<Task>(taskId, std::move(task), priority, sequence, std::move(progress));

    {
        std::unique_lock<std::mutex> lock(queueMutex);
        if (stop) {
            return makeErrorResult("ThreadPool is stopped");
        }

        const auto limit = queueLimit.load();
        if (limit > 0 && pendingTasks.load() >= limit) {
            return makeErrorResult("ThreadPool queue limit reached");
        }

        tasks.push(taskObj);
        taskMap[taskId] = taskObj;
        pendingTasks++;
    }

    condition.notify_one();

    std::unique_lock<std::mutex> completionLock(taskObj->mutex);
    taskObj->completionCv.wait(completionLock, [&taskObj] {
        return taskObj->finished;
    });

    if (!taskObj->hasResult) {
        auto result = makeErrorResult("ThreadForge task completed without result");
        if (taskObj->cancelled) {
            result.cancelled = true;
            result.errorMessage = "Task cancelled";
        }
        return result;
    }

    return taskObj->result;
}

bool ThreadPool::cancelTask(const std::string& taskId) {
    std::shared_ptr<Task> taskRef;
    {
        std::lock_guard<std::mutex> lock(queueMutex);
        auto it = taskMap.find(taskId);
        if (it == taskMap.end()) {
            return false;
        }
        taskRef = it->second;
        taskRef->cancelled = true;
    }

    {
        std::lock_guard<std::mutex> taskLock(taskRef->mutex);
        if (!taskRef->hasResult) {
            taskRef->result = makeCancelledResult();
            taskRef->hasResult = true;
        }
        taskRef->finished = true;
    }

    taskRef->completionCv.notify_all();
    condition.notify_all();
    return true;
}

void ThreadPool::pause() {
    std::lock_guard<std::mutex> lock(queueMutex);
    paused = true;
}

void ThreadPool::resume() {
    {
        std::lock_guard<std::mutex> lock(queueMutex);
        paused = false;
    }
    condition.notify_all();
}

bool ThreadPool::isPaused() const {
    return paused.load();
}

size_t ThreadPool::getThreadCount() const {
    return workers.size();
}

size_t ThreadPool::getPendingTaskCount() const {
    return pendingTasks.load();
}

size_t ThreadPool::getActiveTaskCount() const {
    return activeTasks.load();
}

void ThreadPool::setConcurrency(size_t threads) {
    if (threads == 0) {
        threads = 1;
    }

    std::vector<std::thread> oldWorkers;
    {
        std::unique_lock<std::mutex> lock(queueMutex);
        if (pendingTasks.load() > 0 || activeTasks.load() > 0) {
            throw std::runtime_error("Cannot resize thread pool while tasks are pending or active");
        }
        stop = true;
        paused = false;
        condition.notify_all();
        oldWorkers.swap(workers);
    }

    for (std::thread& worker : oldWorkers) {
        if (worker.joinable()) {
            worker.join();
        }
    }

    {
        std::lock_guard<std::mutex> lock(queueMutex);
        stop = false;
        paused = false;
        for (size_t i = 0; i < threads; ++i) {
            workers.emplace_back([this] { this->workerThread(); });
        }
    }
}

size_t ThreadPool::getQueueLimit() const {
    return queueLimit.load();
}

void ThreadPool::setQueueLimit(size_t limit) {
    queueLimit = limit;
}

void ThreadPool::shutdown() {
    {
        std::unique_lock<std::mutex> lock(queueMutex);
        stop = true;
        paused = false;
    }

    condition.notify_all();

    for (std::thread& worker : workers) {
        if (worker.joinable()) {
            worker.join();
        }
    }
    workers.clear();

    {
        std::lock_guard<std::mutex> lock(queueMutex);
        tasks = decltype(tasks)();
        taskMap.clear();
        pendingTasks = 0;
        activeTasks = 0;
        stop = false;
        paused = false;
    }
}

} // namespace threadforge
