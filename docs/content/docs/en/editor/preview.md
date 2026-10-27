---
title: "Preview, source seeking, and debugging"
description: "Run Web or macOS Native preview, seek script steps, and inspect elements, storage, audio intent, and performance."
order: 9
---

## Run and switch targets

Select Web or Native in the preview toolbar. F5 runs/restarts; Shift+F5 stops. The workbench saves documents and checks dependencies first; conflicts stop the operation. Web uses `dev:web` or `dev`, while Native uses `dev:native`. Switching stops the previous backend and does not migrate live game state.

Native layer embedding currently supports macOS only and needs Rust, system tooling, and the project's Editor preview protocol. Input primarily supports pointers; keyboard/IME, wheel, and independent viewport resize are not fully integrated. Windows/Linux report unsupported embedding rather than switching to screenshot transport.

Cocos/Godot use their independent project generation and runtime workflows; see [platform guides (Chinese)](/docs/platforms).

## Seek, step, and reload

Place the cursor on dialogue/a choice and use To Cursor (**到光标**) or Ctrl/Cmd+Alt+Enter, or right-click Run to This Line (**运行到此行**). The editor saves first and uses compiler step locations. F10 advances a waiting step; unresolved choices require actual selection.

Projects register a recoverable baseline and script factories. Seeking restores that baseline and executes the target file sequentially. It does not reconstruct earlier chapters' branch variables; the project must supply an appropriate baseline when those matter.

Saving `.qs` reloads and attempts to restore the current step. Deleted/unmatched steps replay from the file start; deleting the file returns to project startup. Web refreshes the session; Native rebuilds JavaScriptCore/QPK and restarts its process. Engine package or Rust changes still need a normal rebuild.

## Popout, fullscreen, and mute

Popout (**独立窗口**), fullscreen, and redocking retain the session. Closing a popout redocks it; Escape exits fullscreen. The speaker button mutes preview across restarts, target switches, and reloads during the current editor run. It changes neither game volume preferences nor audio progress.

## Inspector and scene debugging

Inspector reads Web DOM or Native QUI hierarchy, properties, bounds, and styles. Filter, collapse, use keyboard navigation, or refresh manually. It is read-only, rather than a complete Chrome DevTools or style editor.

Web Scene Debugging records executed dialogue and voice/BGM/SFX/ambient intent intervals. Step, enable automatic/manual reading, or replay selected dialogue. Intervals are not decoded waveform durations; stopping automatic reading does not freeze authored actions. See [editing from the scene](/docs/en/editor/authoring#edit-from-the-running-scene) for guarded property picking.

## Storage and resources

Storage (**存储**) reads the active session. Web exposes Local/Session Storage, IndexedDB, and Cache Storage; Native exposes engine saves, Host namespaces, QPKs, and resources. Filter/page results, inspect JSON/text/bounded binary previews, and copy values. Green rows identify resident resources.

Web preview uses a temporary isolated partition cleared on stop. The current Native Demo also uses session-only MemoryBackend/InMemory Host storage. Production persistence can differ. Hover backend information and do not treat preview data as a production save backup.

Web resource inspection requires the project's resource-query injection. Handle counts, references, and estimated bytes exclude browser-internal caches and GPU allocations. Native engine-save inspection needs the development runtime. Session replacement/stop clears old results.

## Performance and logs

Performance displays the latest 60 seconds of FPS, frame intervals, CPU/RSS, and available GPU metrics. Web FPS measures rAF callbacks; Native FPS measures submitted frames and draw calls include composition, shadow, and blur passes. CPU covers the preview rendering process, with 100% per logical core. System GPU utilization and process allocations have different scopes; unavailable values show `—`.

Debug Console shows runtime/dependency logs and error details; use the terminal for interactive commands. Keep the first error and source, then follow [troubleshooting](/docs/en/editor/troubleshooting).
