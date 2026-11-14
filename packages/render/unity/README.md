# @quajs/renderer-unity

Thin Unity adapter over `@quajs/renderer-scene`, using SceneHost from `@quajs/unity-host`. QuaUnityRendererController, the visual novel preset, QUI and aligned `./plugins/*` entries re-export shared projection behavior. No independent narrative state, layout math, eventbus or media policy lives here.

Construct `QuaUnityRendererController({ host, assets, pipeline, initialView, plugins })`, await start(), then destroy(). Generated bootstraps normally wire this through the sole unity-core-resolver; inactive Web/Cocos/Godot/Native cores are rejected.

Optional entries cover input, fonts, background, sprite, character, effects, dialogue, choices, audio, scene, UI, settings, backlog, gallery, achievement and save previews. Entry availability does not prove every optional native capability. See [Unity Host](../../platform/unity-host/README.md) for initial uGUI limitations, embedding and unqualified SDK scopes. Existing engine/plugin decorators are reused without Unity-specific syntax; projections preserve QPK provenance.

Run package test/typecheck/build and shared renderer-scene regressions. Adapter tests verify identity and plugin mappings; real Unity Editor/Player input, media and visual acceptance are separate.
