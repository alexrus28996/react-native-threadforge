import { NativeModules } from 'react-native';

type Primitive = string | number | boolean | undefined;

const { ThreadForge } = NativeModules;

export enum TaskPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
}

export type ThreadForgeTaskDescriptor =
  | { type: 'HEAVY_LOOP'; iterations: number }
  | { type: 'TIMED_LOOP'; durationMs: number }
  | { type: 'MIXED_LOOP'; iterations: number; offset?: number }
  | { type: 'INSTANT_MESSAGE'; message: string };

export type ThreadForgeScheduledTask = {
  id: string;
  descriptor: ThreadForgeTaskDescriptor;
  priority?: TaskPriority;
};

const serializeTaskDescriptor = (descriptor: ThreadForgeTaskDescriptor) => {
  const { type, ...rest } = descriptor as Record<string, Primitive>;
  const encoded = Object.entries(rest)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join('|');
  return encoded ? `${type}|${encoded}` : type;
};

class ThreadForgeEngine {
  private initialized = false;

  async initialize(threadCount = 4) {
    await ThreadForge.initialize(threadCount);
    this.initialized = true;
  }

  private ensureInitialized() {
    if (!this.initialized) {
      throw new Error('ThreadForge has not been initialized');
    }
  }

  async runTask(taskId: string, descriptor: ThreadForgeTaskDescriptor, priority = TaskPriority.NORMAL) {
    this.ensureInitialized();
    const taskPayload = serializeTaskDescriptor(descriptor);
    return ThreadForge.executeTask(taskId, priority, taskPayload);
  }

  async runParallelTasks(tasks: ThreadForgeScheduledTask[]) {
    return Promise.all(
      tasks.map((task) => this.runTask(task.id, task.descriptor, task.priority ?? TaskPriority.NORMAL)),
    );
  }

  async getStats() {
    this.ensureInitialized();
    const [threadCount, pendingTasks, activeTasks] = await Promise.all([
      ThreadForge.getThreadCount(),
      ThreadForge.getPendingTaskCount(),
      ThreadForge.getActiveTaskCount(),
    ]);

    return { threadCount, pendingTasks, activeTasks };
  }

  async shutdown() {
    if (!this.initialized) {
      return;
    }
    await ThreadForge.shutdown();
    this.initialized = false;
  }

  isInitialized() {
    return this.initialized;
  }
}

export const threadForge = new ThreadForgeEngine();
export { ThreadForgeEngine };
export default threadForge;
