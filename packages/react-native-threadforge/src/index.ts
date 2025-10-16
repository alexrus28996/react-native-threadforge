// Author: Abhishek Kumar <alexrus28996@gmail.com>
import { NativeEventEmitter, NativeModules, type EmitterSubscription } from 'react-native';

export const DEFAULT_PROGRESS_THROTTLE_MS = 100;
const PROGRESS_EVENT = 'threadforge_progress';

export enum TaskPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
}

export type ThreadForgeStats = {
  threadCount: number;
  pending: number;
  active: number;
};

export type ThreadForgeProgressListener = (taskId: string, progress: number) => void;

type SerializableWorker<T> = (() => T) & { __threadforgeSource?: string };

type NativeThreadForgeModule = {
  initialize(threadCount: number): Promise<boolean>;
  runFunction(taskId: string, priority: number, source: string): Promise<string>;
  cancelTask(taskId: string): Promise<boolean>;
  getStats(): Promise<ThreadForgeStats | string>;
  shutdown(): Promise<boolean>;
  addListener?: (eventName: string) => void;
  removeListeners?: (count: number) => void;
};

type NativeRunFunctionSuccess = { status: 'ok'; value: unknown };
type NativeRunFunctionError = { status: 'error'; message?: string; stack?: string };
type NativeRunFunctionCancelled = { status: 'cancelled'; message?: string; stack?: string };
type NativeRunFunctionResponse =
  | NativeRunFunctionSuccess
  | NativeRunFunctionError
  | NativeRunFunctionCancelled;

const { ThreadForge } = NativeModules as { ThreadForge: NativeThreadForgeModule };

const BYTECODE_PLACEHOLDER = '[bytecode]';

const parseNativeResponse = (payload: string): NativeRunFunctionResponse => {
  try {
    return JSON.parse(payload) as NativeRunFunctionResponse;
  } catch (error) {
    throw new Error(`Invalid response from native ThreadForge module: ${String(error)}`);
  }
};

const ensureStats = (input: ThreadForgeStats | string): ThreadForgeStats => {
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input) as Partial<ThreadForgeStats>;
      return {
        threadCount: parsed.threadCount ?? 0,
        pending: parsed.pending ?? 0,
        active: parsed.active ?? 0,
      };
    } catch {
      return { threadCount: 0, pending: 0, active: 0 };
    }
  }
  return input;
};

export class ThreadForgeCancelledError extends Error {
  constructor(message = 'ThreadForge task was cancelled') {
    super(message);
    this.name = 'ThreadForgeCancelledError';
  }
}

export class ThreadForgeEngine {
  private initialized = false;
  private readonly emitter = new NativeEventEmitter(ThreadForge);

  async initialize(threadCount = 4): Promise<void> {
    await ThreadForge.initialize(Math.max(1, threadCount));
    this.initialized = true;
  }

  private ensureInitialized() {
    if (!this.initialized) {
      throw new Error('ThreadForge has not been initialized');
    }
  }

  onProgress(listener: ThreadForgeProgressListener): EmitterSubscription {
    this.ensureInitialized();
    return this.emitter.addListener(PROGRESS_EVENT, (event: { taskId: string; progress: number }) => {
      listener(event.taskId, event.progress);
    });
  }

  async runFunction<T>(
    id: string,
    fn: SerializableWorker<T>,
    priority: TaskPriority = TaskPriority.NORMAL,
  ): Promise<T> {
    this.ensureInitialized();

    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('ThreadForge requires a non-empty task id');
    }

    if (typeof fn !== 'function') {
      throw new Error('ThreadForge runFunction expects a callable function');
    }

    const sourceOverride =
      typeof fn.__threadforgeSource === 'string' && fn.__threadforgeSource.trim().length > 0
        ? fn.__threadforgeSource
        : null;
    const serialized = sourceOverride ?? fn.toString();

    if (serialized.includes(BYTECODE_PLACEHOLDER)) {
      throw new Error(
        [
          'ThreadForge could not serialize the provided function.',
          'Hermes strips function source code when producing bytecode-only bundles (commonly in release builds).',
          'Provide the original source via fn.__threadforgeSource or construct the worker at runtime so its source is available.',
        ].join(' '),
      );
    }

    const payload = await ThreadForge.runFunction(id, priority, serialized);
    const response = parseNativeResponse(payload);

    if (response.status === 'ok') {
      return response.value as T;
    }

    if (response.status === 'cancelled') {
      throw new ThreadForgeCancelledError(response.message);
    }

    const error = new Error(response.message ?? 'ThreadForge task failed');
    if (response.stack) {
      error.stack = response.stack;
    }
    throw error;
  }

  async cancelTask(id: string): Promise<boolean> {
    this.ensureInitialized();
    return ThreadForge.cancelTask(id);
  }

  async getStats(): Promise<ThreadForgeStats> {
    this.ensureInitialized();
    const stats = await ThreadForge.getStats();
    return ensureStats(stats);
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    await ThreadForge.shutdown();
    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export const threadForge = new ThreadForgeEngine();
export default threadForge;
