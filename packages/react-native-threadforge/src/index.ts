// Author: Abhishek Kumar <alexrus28996@gmail.com>
import { NativeEventEmitter, NativeModules, type EmitterSubscription } from 'react-native';

type NativeThreadForgeModule = {
  initialize(threadCount: number): Promise<boolean>;
  executeTask(taskId: string, priority: number, payload: string): Promise<string>;
  runRegisteredTask(taskId: string, taskName: string, priority: number, payload: string): Promise<string>;
  registerTask(name: string, definition: string): Promise<boolean>;
  unregisterTask(name: string): Promise<boolean>;
  cancelTask(taskId: string): Promise<boolean>;
  pause(): Promise<boolean>;
  resume(): Promise<boolean>;
  isPaused(): Promise<boolean>;
  getThreadCount(): Promise<number>;
  getPendingTaskCount(): Promise<number>;
  getActiveTaskCount(): Promise<number>;
  setConcurrency(threadCount: number): Promise<boolean>;
  setQueueLimit(limit: number): Promise<boolean>;
  getQueueLimit(): Promise<number>;
  shutdown(): Promise<boolean>;
};

const { ThreadForge } = NativeModules as { ThreadForge: NativeThreadForgeModule };

export const DEFAULT_PROGRESS_THROTTLE_MS = 100;

const PROGRESS_EVENT = 'threadforge_progress';

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

export type ThreadForgePlaceholder = { fromPayload: string; default?: unknown };
export type ThreadForgeCustomValue = string | number | boolean | ThreadForgePlaceholder;

export type ThreadForgeCustomTaskStep = {
  type: string;
  [key: string]: ThreadForgeCustomValue;
};

export type ThreadForgeCustomTaskDefinition = {
  steps: ThreadForgeCustomTaskStep[];
};

export type ThreadForgeProgressEvent = {
  taskId: string;
  progress: number;
};

export type ThreadForgeRunTaskOptions = {
  id?: string;
  priority?: TaskPriority;
};

type InternalRunTaskOptions = {
  id: string;
  priority: TaskPriority;
};

const serialize = (value: unknown): string => {
  return JSON.stringify(value ?? {});
};

const isDescriptor = (value: unknown): value is ThreadForgeTaskDescriptor => {
  return Boolean(value && typeof value === 'object' && 'type' in (value as Record<string, unknown>));
};

const toOptions = (input?: ThreadForgeRunTaskOptions | TaskPriority): ThreadForgeRunTaskOptions => {
  if (typeof input === 'number') {
    return { priority: input };
  }
  return input ?? {};
};

const ensureTaskOptions = (
  idFallback: string,
  options?: ThreadForgeRunTaskOptions | TaskPriority,
): InternalRunTaskOptions => {
  const normalized = toOptions(options);
  return {
    id: normalized.id ?? idFallback,
    priority: normalized.priority ?? TaskPriority.NORMAL,
  };
};

class ThreadForgeEngine {
  private initialized = false;
  private readonly emitter = new NativeEventEmitter(ThreadForge);

  async initialize(threadCount = 4) {
    await ThreadForge.initialize(threadCount);
    this.initialized = true;
  }

  private ensureInitialized() {
    if (!this.initialized) {
      throw new Error('ThreadForge has not been initialized');
    }
  }

  on(event: 'progress', listener: (event: ThreadForgeProgressEvent) => void): EmitterSubscription {
    this.ensureInitialized();
    return this.emitter.addListener(PROGRESS_EVENT, (payload: ThreadForgeProgressEvent) => {
      listener(payload);
    });
  }

  async runTask(
    arg1: string | ThreadForgeTaskDescriptor,
    arg2?: ThreadForgeTaskDescriptor | unknown | ThreadForgeRunTaskOptions | TaskPriority,
    arg3?: ThreadForgeRunTaskOptions | TaskPriority,
  ) {
    this.ensureInitialized();

    if (isDescriptor(arg1)) {
      const options = ensureTaskOptions(`threadforge-${Date.now()}`, arg2 as ThreadForgeRunTaskOptions | TaskPriority);
      return this.runNativeTask(options.id, arg1, options.priority);
    }

    if (isDescriptor(arg2)) {
      const options = ensureTaskOptions(arg1, arg3);
      return this.runNativeTask(arg1, arg2, options.priority);
    }

    const name = arg1;
    const payload = arg2;
    const options = ensureTaskOptions(`${name}-${Date.now()}`, arg3);
    return this.runRegisteredTask(options.id, name, payload, options.priority);
  }

  async runNativeTask(taskId: string, descriptor: ThreadForgeTaskDescriptor, priority: TaskPriority = TaskPriority.NORMAL) {
    this.ensureInitialized();
    const payload = serialize(descriptor);
    return ThreadForge.executeTask(taskId, priority, payload);
  }

  async runRegisteredTask(
    taskId: string,
    taskName: string,
    payload: unknown,
    priority: TaskPriority = TaskPriority.NORMAL,
  ) {
    this.ensureInitialized();
    return ThreadForge.runRegisteredTask(taskId, taskName, priority, serialize(payload));
  }

  async registerTask(
    name: string,
    definition: ThreadForgeCustomTaskDefinition | (() => ThreadForgeCustomTaskDefinition),
  ) {
    this.ensureInitialized();
    const config = typeof definition === 'function' ? definition() : definition;
    if (!config || !Array.isArray(config.steps) || config.steps.length === 0) {
      throw new Error('Custom task definition must include at least one step');
    }
    await ThreadForge.registerTask(name, serialize(config));
  }

  async unregisterTask(name: string) {
    this.ensureInitialized();
    await ThreadForge.unregisterTask(name);
  }

  async cancelTask(taskId: string) {
    this.ensureInitialized();
    return ThreadForge.cancelTask(taskId);
  }

  async pause() {
    this.ensureInitialized();
    await ThreadForge.pause();
  }

  async resume() {
    this.ensureInitialized();
    await ThreadForge.resume();
  }

  async isPaused() {
    this.ensureInitialized();
    return ThreadForge.isPaused();
  }

  async runParallelTasks(tasks: ThreadForgeScheduledTask[]) {
    return Promise.all(
      tasks.map((task) => this.runNativeTask(task.id, task.descriptor, task.priority ?? TaskPriority.NORMAL)),
    );
  }

  async setConcurrency(threadCount: number) {
    this.ensureInitialized();
    await ThreadForge.setConcurrency(threadCount);
  }

  async setQueueLimit(limit: number) {
    this.ensureInitialized();
    await ThreadForge.setQueueLimit(limit);
  }

  async getStats() {
    this.ensureInitialized();
    const [threadCount, pendingTasks, activeTasks, queueLimit] = await Promise.all([
      ThreadForge.getThreadCount(),
      ThreadForge.getPendingTaskCount(),
      ThreadForge.getActiveTaskCount(),
      ThreadForge.getQueueLimit(),
    ]);

    return { threadCount, pendingTasks, activeTasks, queueLimit };
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
