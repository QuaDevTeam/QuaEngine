# Production project builds

The editor's application dropdown provides **文件 → 生产打包…**, also available in the macOS global File menu and through **⌘/Ctrl Shift B**. The panel saves open documents through the editor, stops preview, streams bounded logs, supports cancellation, and reveals successful output. The host rejects dirty documents and concurrent project operations. Build failures do not replace an existing native release.

The editor shows actual target-specific stages, per-stage elapsed time and resource-bundle counts. A stage completes only after its operation succeeds. Unconfigured notarization is marked skipped; failures and cancellation retain the active step. Closing the panel keeps the build running, and reopening restores its progress. Human logs are available in a disclosure and expand on failure. Programmatic callers use `onProgress`; the editor consumes versioned NDJSON through `--progress-fd 3`, separate from stdout/stderr.

The same pipeline is available outside the editor:

```sh
quack project build --target web
quack project build --target native
```

Web uses the project's Vite configuration in production mode and emits a site plus validated target manifest under `dist/web-production/<version>-<timestamp>`. Serve this directory with a static HTTP server. The default native build targets the desktop OS and Cargo architecture of the build machine. Use `--platform macos`, `--platform windows` or `--platform linux` on the corresponding host. The CLI also supports Android and iOS. The generated `.app` contains a Mach-O executable, QPK content, target manifest, icon and `Info.plist`. It needs no Node, Cargo, development server, source checkout or launch environment on the player's machine.

Windows and Linux builds publish a movable `Game/` directory. Launch `game.exe` on Windows or `./game` on Linux and distribute the adjacent `resources/` directory with it. The executable verifies the launch manifest, target manifest and QPK hashes. The Linux host needs JavaScriptCoreGTK 4.1, libudev, the audio libraries selected by the project and a compatible graphics driver. macOS produces a signed application bundle.

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
    platforms: [macos, windows, linux, ios, android]
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
      desktopTextures:
        format: auto
      macos:
        minimumSystemVersion: '11.0'
        signing:
          mode: adhoc
        notarization:
          enabled: false
```

Build paths are relative to the project root. `cargoManifest` points to a Rust workspace containing the Qua native app; Demo uses `../packages/native/Cargo.toml`. Vite must produce the resident application module inside a Quack workspace bundle. `appAsset` is its exact QPK asset path. Quack builds the workspace bundles in dependency order as uncompressed, unencrypted QPKs, preserving bundle identities. It validates the emitted import graph against the selected target core before packaging. Web-safe QUI/QSS runtime code imports `@quajs/native-ui-compiler/runtime`; Sass and native compatibility generators belong to build tooling.

An existing `outputDir/release/version-buildNumber/<platform>` is never overwritten. Increment `app.buildNumber` for the next release. Temporary staging and an exclusive lock protect concurrent builds. A machine/process crash can leave a `.lock` directory; remove it only after confirming no build owns it.

The OS titlebar displays `name`; developer windows add `(Dev)`. macOS provides the normal close, minimize, fullscreen, resize and titlebar dragging behavior. Authored stage coordinates still describe the content area.

## Mobile native applications

Select the platform explicitly from the project directory. All three commands use the same native resolver, resident JavaScriptCore application, QPKs and wgpu product loop. The simulator uses its own release directory. Quack compares the compiled runtime descriptor and hashes before publishing each build.

```sh
quack project build --target native --platform ios-simulator
quack project build --target native --platform ios
quack project build --target native --platform android
```

**iOS** requires Xcode, its iOS SDKs and a Rust toolchain with the appropriate standard libraries. Use `rustup target add aarch64-apple-ios aarch64-apple-ios-sim` on Apple Silicon or use `x86_64-apple-ios` for an Intel simulator. Set the toolchain on PATH so Cargo invokes the matching rustc. Simulator builds produce an ad-hoc signed `.app` for `xcrun simctl install`. Device builds produce an unsigned arm64 `Game.xcarchive` by default. For a local installable development or ad-hoc `Game.ipa`, set `QUA_IOS_SIGNING_IDENTITY` to the SHA-1 fingerprint of an installed identity and `QUA_IOS_PROVISIONING_PROFILE` to its matching Xcode-installed device profile. Quack checks expiry, the app identifier, registered devices and the certificate, then signs the archive. Developer-managed profiles use Xcode's local manual export. For an Xcode-managed device profile, Quack packages the verified, explicitly signed app in the IPA's Payload directory. The profile must authorize the intended device. Xcode export failures leave the release directory available for retry. The deployment target is iOS 15.4. Its system JavaScriptCore provides the ES2022 built-ins used by the module loader and game bundle. The project layout selects portrait or landscape orientation for phones and tablets.

**Android** targets arm64-v8a, Android API 28+, and Vulkan 1.1-capable devices. Build with a macOS or Linux host with native JSC support for the capability probe, a JDK with the `jar` tool, Android SDK Platform 35, Build Tools 35.0.0, NDK r28c, and Rust target `aarch64-linux-android`. Set `ANDROID_HOME`, `ANDROID_NDK_HOME`, and `JAVA_HOME`. Set `QUA_ANDROID_JSC_LIB_DIR` to a build cache directory and run `python3 packages/native/sdk/prepare-android-jsc.py "$QUA_ANDROID_JSC_LIB_DIR"` from the QuaEngine checkout. The helper verifies the release archive and native library against the Rust distribution pins.

The default APK is aligned and unsigned. To produce an installable signed APK, set `QUA_ANDROID_KEYSTORE` to an absolute keystore path, `QUA_ANDROID_KEY_ALIAS` to its alias and `QUA_ANDROID_STORE_PASSWORD` in the build environment. Set `QUA_ANDROID_KEY_PASSWORD` when the key has a separate password. Quack signs after alignment and verifies the resulting APK with the Android build tools. Install the signed file with `adb install <path-to-game.apk>`. The release contains the NativeActivity host, Vulkan renderer, pinned JavaScriptCore library and any required shared C++ runtime.

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

### GPU texture compression for Native

Set `targets.native.distribution.desktopTextures.format: auto` for desktop release builds. This selects ASTC on macOS and BC7 on Windows and Linux. The same block accepts `paths` and `ktx`. Desktop release settings override matching fields in `assetTarget.nativeTextures` and inherit its other options. Ordinary workspace bundles, debug builds and mobile targets use their own asset target settings. To include offline GPU encoding across native asset builds, configure the project's native asset target as shown below. Install Khronos KTX-Software on the build machine (tested with 4.4.2) and put `ktx` on `PATH`, or set `nativeTextures.ktx` to its executable path.

```yaml
targets:
  native:
    assetTarget:
      name: native
      nativeTextures:
        format: auto
        paths: [images/backgrounds, images/cg, characters]
```

`auto` follows the artifact platform. macOS, iOS and Android builds select ASTC. Windows and Linux builds select BC7. An explicit `astc` or `bc7` works for both project builds and standalone native QPK asset targets. For a standalone QPK consumed by the native host, select `compression.algorithm: none` for the outer archive.

The optional `paths` list defaults to the three directories shown. Each entry matches one source-relative file or a directory tree. Single-frame PNG, JPEG and WebP images are eligible. ASTC uses 6×6 blocks for backgrounds and CGs and 4×4 for characters. BC7 uses 4×4 throughout. Character textures discard empty margins and retain the logical canvas and crop offset for drawing. Quack generates premultiplied color and the mip chain offline.

Each selected image keeps its ordinary bytes in the QPK alongside a private GPU payload. This increases download size while reducing texture residency and runtime preparation. The renderer checks the device features and texture dimensions, and reads the same package's ordinary image when the variant cannot be used. Omit both `assetTarget.nativeTextures` and `distribution.desktopTextures` to ship ordinary images only. For a desktop fleet with known BC7 support, `desktopTextures.format: bc7` also selects BC7 for macOS.
