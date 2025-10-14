import type { EmitterSubscription } from 'react-native';

jest.mock('react-native', () => {
  const listeners: Record<string, ((payload: any) => void)[]> = {};

  return {
    NativeModules: {
      ThreadForge: {
        initialize: jest.fn().mockResolvedValue(true),
        addListener: jest.fn(),
        removeListeners: jest.fn(),
        executeTask: jest.fn().mockResolvedValue('ok'),
        runRegisteredTask: jest.fn().mockResolvedValue('custom-ok'),
        registerTask: jest.fn().mockResolvedValue(true),
        unregisterTask: jest.fn().mockResolvedValue(true),
        cancelTask: jest.fn().mockResolvedValue(true),
        pause: jest.fn().mockResolvedValue(true),
        resume: jest.fn().mockResolvedValue(true),
        isPaused: jest.fn().mockResolvedValue(false),
        getThreadCount: jest.fn().mockResolvedValue(4),
        getPendingTaskCount: jest.fn().mockResolvedValue(0),
        getActiveTaskCount: jest.fn().mockResolvedValue(0),
        setConcurrency: jest.fn().mockResolvedValue(true),
        setQueueLimit: jest.fn().mockResolvedValue(true),
        getQueueLimit: jest.fn().mockResolvedValue(16),
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

import { threadForge, TaskPriority } from '../src';

describe('threadForge', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    Object.keys(__listeners).forEach((key) => {
      __listeners[key] = [];
    });
    await threadForge.initialize(2);
  });

  it('serializes native descriptors', async () => {
    await threadForge.runTask('task-1', { type: 'INSTANT_MESSAGE', message: 'Hello' });
    expect(NativeModules.ThreadForge.executeTask).toHaveBeenCalledTimes(1);
    const payload = NativeModules.ThreadForge.executeTask.mock.calls[0][2];
    expect(JSON.parse(payload)).toEqual({ type: 'INSTANT_MESSAGE', message: 'Hello' });
  });

  it('registers and executes custom tasks with payload', async () => {
    await threadForge.registerTask('custom', {
      steps: [{ type: 'HEAVY_LOOP', iterations: { fromPayload: 'iterations', default: 10 } }],
    });

    expect(NativeModules.ThreadForge.registerTask).toHaveBeenCalledWith(
      'custom',
      JSON.stringify({
        steps: [{ type: 'HEAVY_LOOP', iterations: { fromPayload: 'iterations', default: 10 } }],
      }),
    );

    await threadForge.runTask('custom', { iterations: 42 }, { id: 'custom-id', priority: TaskPriority.HIGH });
    expect(NativeModules.ThreadForge.runRegisteredTask).toHaveBeenCalledWith(
      'custom-id',
      'custom',
      TaskPriority.HIGH,
      JSON.stringify({ iterations: 42 }),
    );
  });

  it('emits progress events', () => {
    const handler = jest.fn();
    const subscription = threadForge.on('progress', handler);
    const progressListeners = __listeners.threadforge_progress ?? [];
    expect(progressListeners).toHaveLength(1);
    progressListeners[0]!({ taskId: 'abc', progress: 0.5 });
    expect(handler).toHaveBeenCalledWith({ taskId: 'abc', progress: 0.5 });
    subscription.remove();
  });
});
