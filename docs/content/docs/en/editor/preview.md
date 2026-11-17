---
title: "Preview, source seeking, and debugging"
description: "Run Web or macOS Native preview, seek script steps, and inspect elements, storage, audio intent, and performance."
order: 9
---

## Run and switch targets

Select Web or Native in the preview toolbar. Press `F5` to launch or restart, and `Shift+F5` to stop. The workbench saves open documents and verifies dependencies first, stopping if any file has a save conflict. Web runs `dev:web` or `dev`, while Native runs `dev:native`. Switching targets shuts down the previous backend and does not migrate live game state across runtimes.

Native layer embedding currently supports macOS only and requires Rust, system build tools, and the project's Editor preview protocol. Interaction currently focuses on pointer input; keyboard/IME, scroll wheel, and independent viewport resizing are not yet fully wired. Windows and Linux report unsupported embedding rather than falling back to screenshot transport.

Cocos and Godot use independent project generation and CLI workflows—see the [platform guides (Chinese)](/docs/platforms).

## Seek, step, and reload

Place your cursor on a dialogue line or choice and click To Cursor (**到光标**) or press `Ctrl/Cmd+Alt+Enter` (or right-click and choose Run to This Line / **运行到此行**). The editor saves first and jumps to the compiler's matching step index. `F10` advances one waiting step; when execution hits a choice, click an option in the preview to continue.

Projects register a recoverable baseline and script factories so seeking can reset to that baseline and replay the target `.qs` file sequentially. It does not guess branch variables from earlier chapters, so prepare an appropriate development baseline when your scene depends on prior state.

Saving a `.qs` file reloads the preview and tries to restore the current step. If the step was removed or no longer matches, playback restarts from the top of the file; deleting the file returns to project startup. Web refreshes the browser session, while Native rebuilds JavaScriptCore/QPK and restarts its process. Changes to engine packages or Rust code still require a normal rebuild.

## Popout, fullscreen, and mute

Popout (**独立窗口**), fullscreen, and redocking preserve the active session. Closing a popout window automatically redocks it, and `Escape` exits fullscreen. The speaker button mutes preview audio across restarts, target switches, and hot reloads for the duration of the editor session without altering your game's volume settings or audio timeline.

## Inspector and scene debugging

Inspector shows the live Web DOM or Native QUI hierarchy along with properties, bounds, and computed styles. You can filter, collapse nodes, navigate by keyboard, or refresh manually—it is a read-only structural inspector rather than a full Chrome DevTools or style editor.

Web Scene Debugging logs executed dialogue and `voice`, `BGM`, `SFX`, and `ambient` intent intervals. You can single-step, toggle auto or manual reading, or replay a selected line. Keep in mind that intent intervals represent scripted durations rather than decoded audio waveforms, and pausing auto-read does not freeze already-dispatched actions. See [edit from the running scene](/docs/en/editor/authoring#edit-from-the-running-scene) for source property picking.

## Storage and resources

Storage (**存储**) inspects the active session: Web shows Local Storage, Session Storage, IndexedDB, and Cache Storage; Native shows engine saves, Host namespaces, mounted QPKs, and resident resources. You can filter, paginate, inspect JSON, raw text, or bounded hex previews, and copy values. Green rows highlight resources currently resident in memory.

Web previews run in a temporary isolated partition that clears on stop, and the current Native Demo also uses session-only `MemoryBackend` and `InMemory Host` storage (production builds can use durable disk backends). Hover over a storage source to see its backend type, and do not rely on temporary preview storage for real game saves.

Web resource inspection requires injecting the project's resource-query callback (handle counts, references, and estimated bytes exclude browser-internal caches and GPU memory), and Native engine-save inspection requires the development runtime. Stopping or replacing a session clears previous entries.

## Performance and logs

Performance graphs the last 60 seconds of FPS, frame intervals, CPU/RSS usage, and available GPU telemetry. Web FPS tracks `requestAnimationFrame` callbacks; Native FPS tracks submitted frames, and draw calls include composition, shadow, and blur passes. CPU covers the preview rendering process (100% per logical core). System GPU utilization and process allocations come from different scopes, and unavailable metrics display `—`.

Debug Console collects runtime and dependency logs along with error details—use the integrated terminal for interactive commands. When something breaks, check the first error and its source location, then follow [troubleshooting](/docs/en/editor/troubleshooting).
