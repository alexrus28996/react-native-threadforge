#pragma once

#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <queue>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

#include "TaskResult.h"

namespace threadforge {

enum class TaskPriority {
    LOW = 0,
    NORMAL = 1,
    HIGH = 2
};

using ProgressCallback = std::function<void(double)>;
using TaskFunction = std::function<TaskResult(const ProgressCallback&, const std::function<bool()>&)>;

struct Task {
    std::string id;
    TaskFunction work;
    TaskPriority priority;
    std::atomic<bool> cancelled{false};
    uint64_t sequence{0};

    std::mutex mutex;
    std::condition_variable completionCv;
    bool finished{false};
    TaskResult result;
    bool hasResult{false};

    ProgressCallback progress;

    Task(std::string taskId, TaskFunction fn, TaskPriority prio, uint64_t seq, ProgressCallback callback)
        : id(std::move(taskId)), work(std::move(fn)), priority(prio), sequence(seq),
          progress(std::move(callback)) {}
};

struct TaskComparator {
    bool operator()(const std::shared_ptr<Task>& lhs, const std::shared_ptr<Task>& rhs) const {
        if (lhs->priority == rhs->priority) {
            return lhs->sequence > rhs->sequence;
        }
        return static_cast<int>(lhs->priority) < static_cast<int>(rhs->priority);
    }
};

class ThreadPool {
public:
    explicit ThreadPool(size_t numThreads = 4);
    ~ThreadPool();

    TaskResult submitTask(const std::string& taskId, TaskPriority priority, TaskFunction task, ProgressCallback progress);
    bool cancelTask(const std::string& taskId);
    void pause();
    void resume();
    bool isPaused() const;

    size_t getThreadCount() const;
    size_t getPendingTaskCount() const;
    size_t getActiveTaskCount() const;

    void setConcurrency(size_t threads);
    size_t getQueueLimit() const;
    void setQueueLimit(size_t limit);

    void shutdown();

private:
    void workerThread();

    std::vector<std::thread> workers;
    std::priority_queue<std::shared_ptr<Task>, std::vector<std::shared_ptr<Task>>, TaskComparator> tasks;
    std::unordered_map<std::string, std::shared_ptr<Task>> taskMap;

    mutable std::mutex queueMutex;
    std::condition_variable condition;
    std::atomic<bool> stop{false};
    std::atomic<bool> paused{false};
    std::atomic<size_t> pendingTasks{0};
    std::atomic<size_t> activeTasks{0};
    std::atomic<uint64_t> sequenceCounter{0};
    std::atomic<size_t> queueLimit{0};
};

} // namespace threadforge
