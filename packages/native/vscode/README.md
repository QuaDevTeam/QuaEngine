# Qua Native Authoring

VSCode language support for QuaEngine native `.qui` and `.qss` files.

This extension starts the native QUI/QSS language server only. It does not load Web, Cocos, or native runtime bootstrap plugins and does not participate in target packaging.

## Commands

- `Qua Native: Format Document` runs the active editor formatter.
- `Qua Native: Validate Open QUI/QSS Documents` syncs current settings and opens the Problems view.
- `Qua Native: Fix All Asset References` applies the native LSP `source.fixAll.quaNativeAssets` action for the active `.qui` or `.qss` document. It only removes invalid or missing resource references returned by LSP diagnostics; it does not create asset files, scan the workspace, or load any Web/Cocos/native target runtime.
- `Qua Native: Restart Language Server` restarts the standalone native authoring language server.
