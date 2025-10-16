import type { EmitterSubscription } from 'react-native';

jest.mock('react-native', () => {
  const listeners: Record<string, ((payload: any) => void)[]> = {};

  return {
    NativeModules: {
      ThreadForge: {
        initialize: jest.fn().mockResolvedValue(true),
        addListener: jest.fn(),
        removeListeners: jest.fn(),
        runFunction: jest
          .fn()
          .mockResolvedValue(JSON.stringify({ status: 'ok', value: 42 })),
        cancelTask: jest.fn().mockResolvedValue(true),
        getStats: jest.fn().mockResolvedValue({ threadCount: 4, pending: 0, active: 0 }),
        shutdown: jest.fn().mockResolvedValue(true),
      },
    },
    NativeEventEmitter: jest.fn().mockImplementation(() => ({
      addListener: (eventName: string, handler: (payload: any) => void): EmitterSubscription => {
        listeners[eventName] = listeners[eventName] ?? [];
        listeners[eventName]!.push(handler);
        return {
          remove: () => {
            listeners[eventName] = (listeners[eventName] ?? []).filter((cb) => cb !== handler);
          },
        } as unknown as EmitterSubscription;
      },
    })),
    __listeners: listeners,
  };
});

const { NativeModules, __listeners } = jest.requireMock('react-native');

import { threadForge, TaskPriority, ThreadForgeCancelledError } from '../src';

describe('threadForge', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    Object.keys(__listeners).forEach((key) => {
      __listeners[key] = [];
    });
    await threadForge.initialize(2);
  });

  it('runs serialized functions on the native module', async () => {
    const result = await threadForge.runFunction('math', () => 21 * 2);
    expect(result).toBe(42);
    expect(NativeModules.ThreadForge.runFunction).toHaveBeenCalledWith(
      'math',
      TaskPriority.NORMAL,
      expect.stringContaining('21 * 2'),
    );
  });

  it('throws typed cancellation errors', async () => {
    NativeModules.ThreadForge.runFunction.mockResolvedValueOnce(
      JSON.stringify({ status: 'cancelled', message: 'stopped' }),
    );
    await expect(threadForge.runFunction('cancel-me', () => 0)).rejects.toBeInstanceOf(
      ThreadForgeCancelledError,
    );
  });

  it('throws native errors with stack information', async () => {
    NativeModules.ThreadForge.runFunction.mockResolvedValueOnce(
      JSON.stringify({ status: 'error', message: 'boom', stack: 'trace' }),
    );
    await expect(threadForge.runFunction('boom', () => 0)).rejects.toThrow('boom');
  });

  it('throws a helpful error when Hermes strips function source', async () => {
    const fn = () => 123;
    Object.defineProperty(fn, 'toString', {
      value: () => 'function () {\n  [bytecode]\n}',
      configurable: true,
    });

    await expect(threadForge.runFunction('hermes', fn)).rejects.toThrow(
      'ThreadForge could not serialize the provided function.',
    );
    expect(NativeModules.ThreadForge.runFunction).not.toHaveBeenCalled();
  });

  it('respects a manual __threadforgeSource override', async () => {
    const fn = () => 321;
    Object.defineProperty(fn, 'toString', {
      value: () => 'function () {\n  [bytecode]\n}',
      configurable: true,
    });
    Object.defineProperty(fn, '__threadforgeSource', {
      value: '() => 7',
      configurable: true,
    });

    await threadForge.runFunction('override', fn);
    expect(NativeModules.ThreadForge.runFunction).toHaveBeenCalledWith(
      'override',
      TaskPriority.NORMAL,
      '() => 7',
    );
  });

  it('emits progress events', () => {
    const handler = jest.fn();
    const subscription = threadForge.onProgress(handler);
    const progressListeners = __listeners.threadforge_progress ?? [];
    expect(progressListeners).toHaveLength(1);
    progressListeners[0]!({ taskId: 'abc', progress: 0.5 });
    expect(handler).toHaveBeenCalledWith('abc', 0.5);
    subscription.remove();
  });

  it('parses native stats payloads', async () => {
    NativeModules.ThreadForge.getStats.mockResolvedValueOnce('{"threadCount":1,"pending":2,"active":3}');
    const stats = await threadForge.getStats();
    expect(stats).toEqual({ threadCount: 1, pending: 2, active: 3 });
  });

  it('records package metadata for npm distribution', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../package.json');
    expect(pkg.version).toBe('1.1.0');
    expect(pkg.author).toBe('Abhishek Kumar (alexrus28996)');
  });
});
