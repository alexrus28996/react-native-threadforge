/**
 * @format
 */

jest.mock('../packages/react-native-threadforge/src', () => {
  const threadForge = {
    initialize: jest.fn(() => Promise.resolve()),
    onProgress: jest.fn(() => ({ remove: jest.fn() })),
    runFunction: jest.fn(() => Promise.resolve('')),
    cancelTask: jest.fn(() => Promise.resolve(true)),
    getStats: jest.fn(() => Promise.resolve({ threadCount: 0, pending: 0, active: 0 })),
    shutdown: jest.fn(() => Promise.resolve()),
    isInitialized: jest.fn(() => true),
  };

  class ThreadForgeCancelledError extends Error {}

  return {
    threadForge,
    default: threadForge,
    TaskPriority: { LOW: 0, NORMAL: 1, HIGH: 2 },
    ThreadForgeCancelledError,
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
