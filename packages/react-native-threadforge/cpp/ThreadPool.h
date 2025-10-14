#pragma once

#include <thread>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <functional>
#include <vector>
#include <atomic>
#include <string>
#include <unordered_map>

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
    
    Task(std::string taskId, std::function<std::string()> fn, TaskPriority prio = TaskPriority::NORMAL)
        : id(std::move(taskId)), work(std::move(fn)), priority(prio) {}
    
    bool operator<(const Task& other) const {
        return priority < other.priority;
    }
};

class ThreadPool {
public:
    explicit ThreadPool(size_t numThreads = 4);
    ~ThreadPool();
    
    std::string submitTask(const std::string& taskId, TaskPriority priority, std::function<std::string()> task);
    bool cancelTask(const std::string& taskId);
    
    size_t getThreadCount() const;
    size_t getPendingTaskCount() const;
    size_t getActiveTaskCount() const;
    
    void shutdown();
    
private:
    void workerThread();
    
    std::vector<std::thread> workers;
    std::priority_queue<std::shared_ptr<Task>, std::vector<std::shared_ptr<Task>>> tasks;
    std::unordered_map<std::string, std::shared_ptr<Task>> taskMap;
    
    mutable std::mutex queueMutex;
    std::condition_variable condition;
    std::atomic<bool> stop{false};
    std::atomic<size_t> pendingTasks{0};
    std::atomic<size_t> activeTasks{0};
};

} // namespace threadforge