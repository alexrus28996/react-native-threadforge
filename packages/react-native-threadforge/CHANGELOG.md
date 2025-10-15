# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2025-10-14

- Replaced descriptor-based APIs with `ThreadForgeEngine.runFunction()` for executing arbitrary JavaScript functions off the UI thread.
- Added native Hermes runtime isolation per task plus JSON-serialised success/error channels.
- Simplified public TypeScript surface (initialize/runFunction/cancelTask/getStats/shutdown) and refreshed documentation for the new workflow.
- Preserved throttled progress events with a streamlined `onProgress` helper.

## [1.0.0] - 2025-10-14

- Initial public release of ThreadForge as a production-ready multithreading toolkit for React Native.
- Published with native C++ worker pool, dynamic task registry, and throttled progress events.
- Tagged as `v1.0.0` to mark the first stable npm release authored by Abhishek Kumar.
