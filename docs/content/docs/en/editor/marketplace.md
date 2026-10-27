---
title: "Install and publish plugins"
description: "Understand runtime versus devtools extensions, install verified package versions, and publish your own plugin."
order: 10
---

## What plugins provide

`package.json.quajs.extension` schema 1 declares `runtime`, `devtools`, or both. Runtime supplies game behavior; devtools supplies editor panels/indexers. Installing a package does not automatically wire its runtime into the game engine.

Character/animation tools ship with the editor. Evaluate third-party behavior and privileges yourself: Registry static or optional AI screening is not a complete sandbox or malware guarantee.

## Install and enable

1. Open a project and choose the marketplace from the activity bar. It is a docked view that retains navigation and documents.
2. Check the package name, exact version, capability type, source, and review status.
3. Install using the project's npm/pnpm workflow. Versions are pinned and lifecycle scripts are disabled. Yarn projects use their own Yarn workflow.
4. Review dependency changes, devtools enablement, and required runtime wiring. Enabling/disabling editor tools does not rewrite the story.

Official badges come from service verification, rather than an `@quajs` name or a custom discovery catalog. Custom discovery still requires the selected Registry's installation review. After cancellation, inspect `package.json` and the lockfile because the package manager may have written changes already.

## Publish a plugin

Open the plugin package directly, then use Plugins → Publish (**插件 → 发布**) to sign into Registry with GitHub. Generate an ownership claim, review the `package.json` draft, and save it.

Build the package. Pack and Inspect Files (**打包并检查文件**) shows the exact tarball name, version, contents, and SHA-512. Publish that same artifact to npm. npm login stays local; Registry never receives an npm token, and an OTP is retained only for the publication operation.

Submit the stable npm `latest` package containing the claim. Claims expire after 24 hours and are consumed on registration. Pre-releases normally use `next`; promote a stable release to `latest` before submitting. Manifest changes require repacking. Cancellation can race npm accepting a publication, so inspect npm's actual result before retrying.

## Review and recovery

For hidden packages, read the review reason, fix the issue, publish a new version, and wait for review. Ordinary updates need no repeated registration; maintainer changes can require a fresh published claim. For login failure, check secure OS storage, Registry origin, and network rather than falling back to plaintext credentials.

See the [Registry reference](/docs/en/editor/registry) for ownership, review, sync, and operations, and the [editor plugin contract (Chinese)](../../../../../docs/design/editor-plugins.md) for extension APIs. Dynamic game content still uses Runtime QPK and engine activation; marketplace installation does not replace package trust or migrations.
