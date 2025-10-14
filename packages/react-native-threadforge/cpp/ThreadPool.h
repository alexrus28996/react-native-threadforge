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

namespace threadforge {

enum class TaskPriority {
    LOW = 0,
    NORMAL = 1,
    HIGH = 2
};

struct Task {
    std::string id;
    std::function<std::string()> work;
    TaskPriority priority;
    std::atomic<bool> cancelled{false};
    uint64_t sequence{0};

    std::mutex mutex;
    std::condition_variable completionCv;
    bool finished{false};
    std::string result;

    Task(std::string taskId, std::function<std::string()> fn, TaskPriority prio, uint64_t seq)
        : id(std::move(taskId)), work(std::move(fn)), priority(prio), sequence(seq) {}
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

    std::string submitTask(const std::string& taskId, TaskPriority priority, std::function<std::string()> task);
    bool cancelTask(const std::string& taskId);
    void pause();
    void resume();
    bool isPaused() const;

    size_t getThreadCount() const;
    size_t getPendingTaskCount() const;
    size_t getActiveTaskCount() const;

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
};

} // namespace threadforge
