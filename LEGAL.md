# Legal Overview

This file summarizes the licensing and rights boundaries for QuaEngine. It is
only a convenience overview. The applicable license text, notices, and written
agreements control if there is any conflict.

## Source Code

QuaEngine source packages are licensed under the Apache License, Version 2.0,
unless a file, package, or directory states otherwise.

| Area | License |
| --- | --- |
| `packages/core/**` | Apache-2.0 |
| `packages/game/**` | Apache-2.0 |
| `packages/platform/**` | Apache-2.0 |
| `packages/render/**` | Apache-2.0 |
| `packages/utils/**` | Apache-2.0 |
| `packages/editor/**` (first-party IDE source, including built-in plugins) | [MPL-2.0](packages/editor/LICENSE) |
| `packages/build/script-compiler` | Apache-2.0 |
| `packages/plugins/**` | Apache-2.0 |
| `packages/build/create-qua-game` | Apache-2.0 |
| `packages/build/create-qua-game/templates/**` | Apache-2.0 |
| `packages/build/language-server` | Apache-2.0 |
| `packages/build/project-inspector` | Apache-2.0 |
| `packages/build/quack` | Apache-2.0 |
| `packages/build/vite-plugin` | Apache-2.0 |
| `packages/build/vscode-quascript` | Apache-2.0 |

### Standalone IDE

The first-party source files under `packages/editor/` are covered by MPL-2.0,
including `core`, `ui`, `electron`, `character`, and `novel-writer`, their tests,
build scripts, configuration, documentation, and bundled agent instructions.
See [the IDE notice](packages/editor/NOTICE) and
[licensing guide](packages/editor/README.md#开源许可与社区共建).
The repository-root Apache license is not an alternative license for this code.
Third-party materials retain their own licenses and notices. Shared engine,
compiler, language-service, inspector, and VS Code extension packages outside
`packages/editor/` retain their existing licenses; using them in the IDE does
not relicense them.

MPL permits commercial use, modification, and redistribution. When distributing
covered source, keep it under MPL and preserve the required notices. When
distributing executable forms, make the corresponding covered source, including
modifications, available to recipients and tell them how to obtain it as required
by MPL Sections 3.1 and 3.2. Separate files that contain no MPL-covered code may
use other licenses as part of a Larger Work (Section 3.3).

Private modifications and server-only use without distributing covered software
do not, by themselves, require source disclosure under MPL. Sending changes
upstream is encouraged but not required. Using the IDE to create a game, story,
or other output does not by itself put that output under MPL; inclusion of
covered source remains subject to its license. Names and brand assets remain
subject to the separate trademark policy below.

## Trademarks And Brand Assets

Open-source software licenses used by QuaEngine do not grant trademark, logo,
icon, badge, package scope, or brand asset rights.

QuaEngine, QuaScript, Quack, @quajs, related package scopes, logos, icons,
badges, and visual brand assets are reserved by QuaDevTeam. See
`TRADEMARKS.md`.

## Demo Content

Demo game content under `demo/` is proprietary and fully copyrighted. This
includes story text, scenario scripts, characters, artwork, generated images,
CGs, UI presentation assets, icons, audio, prompts, masks, and other creative
materials.

You may download and run the demo only to evaluate or demonstrate QuaEngine.
No license is granted to copy, redistribute, modify, extract, reuse, train on,
sell, publish, or include the demo content in another game, engine, dataset,
product, template, asset pack, or public distribution. See `demo/LICENSE`.

## Third-Party Materials

Third-party dependencies, tools, fonts, media, and generated outputs may be
covered by their own licenses, terms, or service policies. Those separate
licenses and terms continue to apply.

## Contributions

Contributions intentionally submitted to the IDE under `packages/editor/` are
submitted under MPL-2.0. Contributors retain copyright in their work and must
have the rights needed to submit it under that license. See the
[IDE contribution guide](packages/editor/CONTRIBUTING.md).

Unless explicitly stated otherwise, contributions intentionally submitted to
other QuaEngine source packages are submitted under Apache-2.0, consistent with
Section 5 of the Apache License, Version 2.0. Contributions spanning these areas
follow the license of each affected area.
