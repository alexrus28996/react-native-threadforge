import { NativeModules } from 'react-native';

const { ThreadForge } = NativeModules;

export enum TaskPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
}

class ThreadForgeEngine {
  private initialized = false;

  async initialize(threadCount = 4) {
    ThreadForge.initialize(threadCount);
    this.initialized = true;
  }

  async runTask(taskId:any, task:any, priority = TaskPriority.NORMAL) {
    if (!this.initialized) {
      throw new Error('Not initialized');
    }
    return task();
  }

  async runParallelTasks(tasks:any) {
    const promises = tasks.map((t) => this.runTask(t.id, t.task, t.priority || TaskPriority.NORMAL));
    return Promise.all(promises);
  }

  async getStats() {
    return {
      threadCount: ThreadForge.getThreadCount(),
      pendingTasks: 0,
      activeTasks: 0
    };
  }

  async shutdown() {
    ThreadForge.shutdown();
    this.initialized = false;
  }

  isInitialized() {
    return this.initialized;
  }
}

export const threadForge = new ThreadForgeEngine();
export { ThreadForgeEngine };
export default threadForge;