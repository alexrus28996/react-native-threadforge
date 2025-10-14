/**
 * @format
 */

jest.mock('../packages/react-native-threadforge/src', () => {
  const threadForge = {
    initialize: jest.fn(() => Promise.resolve()),
    on: jest.fn(() => ({ remove: jest.fn() })),
    runTask: jest.fn(() => Promise.resolve('')),
    runNativeTask: jest.fn(() => Promise.resolve('')),
    runRegisteredTask: jest.fn(() => Promise.resolve('')),
    registerTask: jest.fn(() => Promise.resolve()),
    unregisterTask: jest.fn(() => Promise.resolve()),
    cancelTask: jest.fn(() => Promise.resolve(true)),
    pause: jest.fn(() => Promise.resolve()),
    resume: jest.fn(() => Promise.resolve()),
    isPaused: jest.fn(() => Promise.resolve(false)),
    runParallelTasks: jest.fn(() => Promise.resolve([])),
    setConcurrency: jest.fn(() => Promise.resolve()),
    setQueueLimit: jest.fn(() => Promise.resolve()),
    getStats: jest.fn(() => Promise.resolve({ threadCount: 0, pendingTasks: 0, activeTasks: 0, queueLimit: 0 })),
    shutdown: jest.fn(() => Promise.resolve()),
    isInitialized: jest.fn(() => true),
  };

  return {
    threadForge,
    default: threadForge,
    TaskPriority: { LOW: 0, NORMAL: 1, HIGH: 2 },
  };
});

import 'react-native';
import React from 'react';
import App from '../App';

// Note: import explicitly to use the types shipped with jest.
import {it} from '@jest/globals';

// Note: test renderer must be required after react-native.
import renderer from 'react-test-renderer';

it('renders correctly', () => {
  renderer.create(<App />);
});
