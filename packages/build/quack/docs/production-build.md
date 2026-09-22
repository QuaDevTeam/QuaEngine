# Production project builds

The editor's application dropdown provides **文件 → 生产打包…**, also available in the macOS global File menu and through **⌘/Ctrl Shift B**. The panel saves open documents through the editor, stops preview, streams bounded logs, supports cancellation, and reveals successful output. The host rejects dirty documents and concurrent project operations. Build failures do not replace an existing native release.

The editor shows actual target-specific stages, per-stage elapsed time and resource-bundle counts. A stage completes only after its operation succeeds. Unconfigured notarization is marked skipped; failures and cancellation retain the active step. Closing the panel keeps the build running, and reopening restores its progress. Human logs are available in a disclosure and expand on failure. Programmatic callers use `onProgress`; the editor consumes versioned NDJSON through `--progress-fd 3`, separate from stdout/stderr.

The same pipeline is available outside the editor:

```sh
quack project build --target web
quack project build --target native
```

Web uses the project's Vite configuration in production mode and emits a site plus validated target manifest under `dist/web-production/<version>-<timestamp>`. Serve this directory with a static HTTP server. Native currently packages **macOS on a macOS host**, for the host's Cargo architecture. Windows/Linux distribution and cross-compilation are not implemented; they fail explicitly. The generated `.app` contains a Mach-O executable, QPK content, target manifest, icon and `Info.plist`. It needs no Node, Cargo, development server, source checkout or launch environment on the player's machine.

## Native project configuration

```yaml
schemaVersion: 1
name: My Game
bundleId: com.example.mygame
version: 1.0.0
icons:
  source: assets/app/icon.png
targets:
  native:
    enabled: true
    platforms: [macos]
    profiles: [debug, release]
    outputDir: dist/native
    app:
      version: 1.0.0
      buildNumber: '1'
      icon: assets/app/icon.png
    build:
      cargoManifest: native/Cargo.toml
      cargoPackage: quajs_native_app
      viteConfig: vite.native-jsc.config.ts
      appAsset: assets/scripts/native-app.mjs
      workspaceConfig: quack.workspace.ts
      cargoFeatures: [native-window, native-audio-rodio, javascriptcore]
    distribution:
      macos:
        minimumSystemVersion: '11.0'
        signing:
          mode: adhoc
        notarization:
          enabled: false
```

Build paths are relative to the project root. `cargoManifest` points to a Rust workspace containing the Qua native app; Demo uses `../packages/native/Cargo.toml`. Vite must produce the resident application module inside a Quack workspace bundle. `appAsset` is its exact QPK asset path. Quack builds the workspace bundles in dependency order as uncompressed, unencrypted QPKs, preserving bundle identities. It validates the emitted import graph against the selected target core before packaging. Web-safe QUI/QSS runtime code imports `@quajs/native-ui-compiler/runtime`; Sass and native compatibility generators belong to build tooling.

An existing `outputDir/release/version-buildNumber/macos` is never overwritten. Increment `app.buildNumber` for the next release. Temporary staging and an exclusive lock protect concurrent builds. A machine/process crash can leave a `.lock` directory; remove it only after confirming no build owns it.

The OS titlebar displays `name`; developer windows add `(Dev)`. macOS provides the normal close, minimize, fullscreen, resize and titlebar dragging behavior. Authored stage coordinates still describe the content area.

## Signing and notarization

PNG/SVG and other Sharp-supported sources are converted to a complete `.icns` set; a supplied `.icns` is copied directly. `adhoc` is the default for local testing. It is not a Developer ID distribution signature.

For distribution, reference an installed Developer ID Application identity and an existing notarytool Keychain profile:

```yaml
distribution:
  macos:
    signing:
      mode: developer-id
      identity: 'Developer ID Application: Example Studio (TEAMID)'
      # Optional custom entitlements, relative to project root:
      # entitlements: native/entitlements.plist
    notarization:
      enabled: true
      keychainProfile: my-game-notary
```

Configure the identity in macOS Keychain and create the profile with `xcrun notarytool store-credentials` outside the project. Never put passwords, private keys, or API keys in YAML. Developer ID builds use hardened runtime and a secure timestamp; the default entitlements enable JavaScriptCore JIT. Custom entitlements must preserve required JIT capability.

When enabled, packaging submits an archive to Apple, waits for **Accepted**, staples and validates the ticket, and runs Gatekeeper assessment. Rejection fails the build without publishing a completed artifact. Ordinary ad-hoc builds only verify their local signature and do not submit anything to Apple.

The executable pins the launch metadata SHA-256; launch metadata pins target-manifest and QPK hashes. Startup resolves resources relative to the executable and verifies bytes before JavaScriptCore evaluation. Packaged builds ignore developer title, bridge, CDP and editor-embedding environment switches. Dynamic Runtime QPK activation remains governed by the engine's separate trust/lifecycle rules.
