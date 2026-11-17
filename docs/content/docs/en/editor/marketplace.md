---
title: "Install and publish plugins"
description: "Understand runtime versus devtools extensions, install verified package versions, and publish your own plugin."
order: 10
---

## What plugins provide

Packages declare `runtime`, `devtools`, or both under `package.json.quajs.extension` (schema 1). Runtime provides in-game behavior, while devtools adds editor panels or project indexers. Installing a package into your dependencies does not automatically wire its runtime into your game engine.

Character and animation tools ship built into the editor. Always evaluate third-party packages and their permissions yourself: Registry static checks and optional AI screening help catch common issues, but they are neither a security sandbox nor a malware guarantee.

## Install and enable

1. Open a project and select Marketplace from the activity bar (it opens as a dockable view without hiding navigation or open files).
2. Review the package name, exact version, capability type, source, and review status.
3. Install through your project's npm or pnpm workflow—exact versions are pinned and install lifecycle scripts are disabled (Yarn projects should install through their own Yarn workflow).
4. Review dependency updates, devtools enablement, and any required runtime wiring in your game entry. Toggling editor devtools never rewrites your story files.

Official badges are granted solely by the Registry's verified allowlist, never by an `@quajs` scope or custom JSON catalog. Even when discovered via a custom catalog, installations still go through the selected Registry's review check. If you cancel mid-install, inspect `package.json` and your lockfile in case the package manager already wrote partial changes.

## Publish a plugin

Open the plugin package directory directly, then select Plugins → Publish (**插件 → 发布**) to sign in to Registry with GitHub. Generate an ownership claim, review the `package.json` draft, and save it.

Build your plugin and run Pack and Inspect Files (**打包并检查文件**) to check the exact tarball name, version, file list, and SHA-512 digest before publishing that same artifact to npm. npm authentication stays local—Registry never sees your npm token, and any OTP is kept in memory only for that publish operation.

Once the package is live under npm's `latest` tag, submit it to Registry. Claims expire after 24 hours and are consumed on initial registration (routine updates do not require re-registering). Pre-releases normally publish under `next`, so promote a stable release to `latest` before submitting. Any manifest change requires repacking; if you cancel a publish near completion, check npm first before retrying in case npm already accepted the tarball.

## Review and recovery

If a package is hidden after review, read the reason shown in the UI, fix the issue, and publish a new version for automatic re-review. Routine updates work automatically, though changing npm maintainers can require publishing a fresh claim. If login fails, check your OS secure storage (Keychain / Credential Manager), Registry URL, and network—the editor never falls back to plaintext credentials.

See the [Registry reference](/docs/en/editor/registry) for ownership, review, sync, and operational details, and the [editor plugin contract (Chinese)](../../../../../docs/design/editor-plugins.md) for extension APIs. Dynamic runtime game content still travels through Runtime QPKs and engine activation; marketplace installation does not replace package trust or state migrations.
