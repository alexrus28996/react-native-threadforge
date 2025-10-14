#include "ThreadPool.h"

namespace threadforge {

ThreadPool::ThreadPool(size_t numThreads) {
    for (size_t i = 0; i < numThreads; ++i) {
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
                return stop || !tasks.empty();
            });
            
            if (stop && tasks.empty()) {
                return;
            }
            
            task = tasks.top();
            tasks.pop();
            
            if (task->cancelled) {
                taskMap.erase(task->id);
                pendingTasks--;
                continue;
            }
            
            activeTasks++;
        }
        
        // Execute task
        task->work();
        
        {
            std::lock_guard<std::mutex> lock(queueMutex);
            taskMap.erase(task->id);
            pendingTasks--;
            activeTasks--;
        }
    }
}

std::string ThreadPool::submitTask(const std::string& taskId, TaskPriority priority, std::function<std::string()> task) {
    auto taskObj = std::make_shared<Task>(taskId, std::move(task), priority);
    
    {
        std::unique_lock<std::mutex> lock(queueMutex);
        if (stop) {
            return "Error: ThreadPool is stopped";
        }
        
        tasks.push(taskObj);
        taskMap[taskId] = taskObj;
        pendingTasks++;
    }
    
    condition.notify_one();
    
    // Wait for task to complete
    while (taskMap.count(taskId) > 0 && !taskObj->cancelled) {
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    return taskObj->cancelled ? "Task cancelled" : "Task completed";
}

bool ThreadPool::cancelTask(const std::string& taskId) {
    std::lock_guard<std::mutex> lock(queueMutex);
    auto it = taskMap.find(taskId);
    if (it != taskMap.end()) {
        it->second->cancelled = true;
        return true;
    }
    return false;
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

void ThreadPool::shutdown() {
    {
        std::unique_lock<std::mutex> lock(queueMutex);
        stop = true;
    }
    
    condition.notify_all();
    
    for (std::thread& worker : workers) {
        if (worker.joinable()) {
            worker.join();
        }
    }
}

} // namespace threadforge