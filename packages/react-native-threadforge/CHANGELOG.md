# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

- Detect Hermes bytecode-only placeholders and surface a helpful serialization error with guidance on
  providing the original source via `__threadforgeSource`.
- Documented the release-build workflow and added demo helpers so ThreadForge tasks keep running when
  Hermes strips function bodies.

## v1.1.0

- Added `threadForge.run(fn, priority?, opts?)` — a convenience wrapper around `runFunction()`.
  - Returns `{ id, result }` to support easy cancellation and logging.
  - Accepts `opts.id` (explicit task id) or `opts.idPrefix` (for auto-generated ids).
  - No native changes; safe and backward-compatible.
- Docs: Added Quick Start, cancellation patterns, and Hermes release serialization note.
- Example: Updated `App.tsx` with mount-time compute, progress, and cancellation.

## [1.1.0] - 2025-10-14

- Replaced descriptor-based APIs with `ThreadForgeEngine.runFunction()` for executing arbitrary JavaScript functions off the UI thread.
- Added native Hermes runtime isolation per task plus JSON-serialised success/error channels.
- Simplified public TypeScript surface (initialize/runFunction/cancelTask/getStats/shutdown) and refreshed documentation for the new workflow.
- Preserved throttled progress events with a streamlined `onProgress` helper.

## [1.0.0] - 2025-10-14

- Initial public release of ThreadForge as a production-ready multithreading toolkit for React Native.
- Published with native C++ worker pool, dynamic task registry, and throttled progress events.
- Tagged as `v1.0.0` to mark the first stable npm release authored by Abhishek Kumar.
