---
name: quascript-authoring
description: Write, review, explain, or update QuaScript `.qs` files and `qs` template literals. Covers the full QuaScript language surface, standalone module structure, dialogue, decorators, choices, interpolation, built-in helpers, decorator activation, plugin decorators, compiler/tooling config, and authoring boundaries.
---

# QuaScript Authoring

## Purpose

Use this skill whenever writing, reviewing, explaining, or changing QuaScript source, compiler behavior, decorator metadata, examples, or docs.

QuaScript is a TypeScript-first narrative DSL for visual-novel content. It deliberately owns a small syntax surface: dialogue, action decorators, choices, metadata decorators, interpolation, and TypeScript integration. It is not a general-purpose scripting language.

## Source Forms

QuaScript appears in two forms:

- Standalone `.qs` modules compiled to a default `createQuaScript(scope?)` factory returning `GameStep[]`.
- `qs` tagged template literals inside TypeScript host modules.

Standalone `.qs` files may contain one module script and one setup script:

```qs
<script lang="ts">
import { formatName } from './story-helpers'

export interface Scope {
  playerName: string
  hasKey: boolean
}
</script>

<script setup lang="ts">
const displayName = formatName(scope.playerName)
</script>

Heroine: Hello ${displayName}.
```

Rules:

- `<script>` blocks must use `lang="ts"`.
- Only one non-setup script and one setup script are allowed.
- The module script is for imports, exported `Scope`, exported helpers, and declarations.
- The setup script is evaluated inside the generated factory and can reference `scope`.
- In standalone modules, use `scope.foo` unless a setup binding gives the value a local name.

In TypeScript host files, use `qs` template literals:

```ts
const steps = qs`
Heroine: The door is open.
- Enter -> library
- Leave -> #outside
`
```

## Core Syntax

### Dialogue

Character dialogue is one line with a top-level colon:

```qs
Character: Text
Yukino: Hello ${scope.playerName}.
Narrator: A colon inside ${format({ label: 'x:y' })} is safe.
```

The speaker name is everything before the top-level `:` after trimming. Speaker names may be non-ASCII. Dialogue text is everything after the colon after leading whitespace is removed.

Bare non-structural text lines are narration with no speaker:

```qs
Rain folds over the station roof.
${scope.playerName} hears footsteps in the hall.
```

Narration lines compile to engine-owned `mode: 'narration'` dialogue and do not add a character to the file speaker set. `Narrator: Text` is still normal character dialogue for a speaker named `Narrator`.

### Interpolation

Use `${...}` inside character dialogue, narration, and choice text for normal TypeScript expressions:

```qs
Narrator: ${scope.playerName} has ${scope.coins} coins.
The pouch holds ${scope.coins} coins.
- Buy ${itemName} -> shop-buy if scope.coins >= price
```

Interpolation must be non-empty and balanced. The compiler exposes `$t` and `t` aliases for `ctx.t(...)` inside interpolated text, and uses `resolveQuaText` for mixed text/expression output.

### Decorators

Decorators start with `@Name` or `@Name(...)`. Arguments are parsed as TypeScript expressions:

```qs
@SetBackground('images/bg/station.jpg', { transition: { type: 'fade', duration: 400 } })
@PlayBGM('audio/bgm/night.ogg', { loop: true })
Narrator: Rain folds over the station roof.
```

Supported argument values include strings, numbers, booleans, `null`, arrays, objects, unary negative numbers, and arbitrary TypeScript expressions such as helper calls.

Decorator placement:

- Consecutive decorators immediately before a dialogue line attach to that dialogue and run before `speakWithEngine`.
- Consecutive decorators immediately before a narration line attach to that narration and run before `narrateWithEngine`; decorators that require a current speaker must use `Character: Text` or an explicit character argument.
- A blank line between decorators and the next dialogue makes the decorators an action-only step.
- Decorators without a following dialogue are action-only steps.
- Multi-line decorator calls are allowed as long as parentheses are balanced.

### Choice Sugar

Choice sugar lines start with `- `:

```qs
- Choice text
- Choice text -> target
- Choice text -> target if condition
- Choice text if condition
```

Sugar target strings are normalized as:

- `target` -> `{ kind: 'node', id: 'target' }`
- `#label` -> `{ kind: 'label', id: 'label' }`
- `scene:sceneId#entryId` -> scene target with optional `entry`
- `script:moduleId#nodeId` -> script target with optional `nodeId`
- `package:packageId#nodeId` -> runtime package node target

When a choice has a target, the generated step shows choices, waits for `user/choice_select`, stores the selected payload on `ctx.choice`, then calls `ctx.engine.jumpToChoice(...)`. If no target is present, it clears choices after selection.

### `@Choice(...)`

Use `@Choice(text, target?, options?)` for structured targets, metadata, presentation, unavailable policy, and helper calls:

```qs
@Choice('Go library', node('library'), {
  id: 'go-library',
  when: scope.hasKey,
  unavailable: { mode: 'disabled', reason: 'Need key' },
  presentation: { thumbnail: image('story/library-thumb.jpg') },
  metadata: { route: 'night' }
})
@Choice('Return dorm', scene('dorm', { entry: 'nightReturn', state: { from: 'library' } }))
```

Do not mix `@Choice` with non-choice decorators in the same decorator block. Multiple consecutive `@Choice` decorators become one choice step.

## Built-In Helpers

QuaScript expressions may call engine helper functions; the compiler imports them when used:

- `node(id, options?)`
- `label(id, options?)`
- `scene(sceneId, options?)`
- `script(moduleId, options?)`
- `checkpoint(id)`
- `packageNode(packageId, nodeId, options?)`
- `image(name, options?)`

Use these helpers in `@Choice` targets, choice presentation, story metadata, and similar TypeScript expression positions.

## Built-In Decorators

Engine/save decorators:

- `@SaveToSlot(slotId, metadata?, options?)`
- `@LoadFromSlot(slotId, options?)`
- `@QuickSave(metadata?, options?)`
- `@QuickLoad()`
- `@AutoSave(metadata?, options?)`

Load decorators such as `@LoadFromSlot` and `@QuickLoad` terminate the current generated step after loading so later dialogue in the same step does not overwrite restored state.

Flow-control decorators:

- `@FlowControl(policy)` / `@FlowControlPolicy(policy)`
- `@ResetFlowControlPolicy`
- `@Skippable(value = true)` / `@NoSkip`
- `@Forwardable(value = true)` / `@NoForward`
- `@AutoAdvanceable(value = true)` / `@NoAutoAdvance`

Rollback decorators:

- `@RollbackAnchor(reason?, options?)`
- `@RollbackBoundary(reason?, options?)`
- `@FixRollback(options?)`
- `@NoRollback`

Choice decorator:

- `@Choice(text, target?, options?)`

## Feature Decorators

Decorator availability is explicit. A plugin decorator is usable only if it is a built-in, registered through tooling config, activated by a current-file value import, or auto-collected from package metadata.

Common package decorators:

- `@quajs/character`: `Speaker`, `SpeakerName`, `SpeakerStyle`, `SetSprite`, `ShowCharacter`, `HideCharacter`, `MoveCharacter`, `SetExpression`, `CharacterFade`, `CharacterEnter`, `CharacterExit`
- `@quajs/story-graph`: `Chapter`, `Scene`, `Entry`, `Node`, `Label`, `Lane`, `Route`, `StoryTimeline`, `Protagonist`, `Interaction`, `EmitStoryEvent`, `ChapterSelect`
- `@quajs/plugin-background`: `SetBackground`, `ClearBackground`, `VideoBackground`, `SetLayeredBackground`, `BackgroundLayer`, `RemoveBackgroundLayer`, `ClearBackgroundLayers`, `BackgroundTransition`, `BackgroundLayerTransition`, `ShowCgOverlay`, `HideCgOverlay`
- `@quajs/plugin-audio`: `AudioChapter`, `LineId`, `PlayVoice`, `PlayBGM`, `PlaySFX`, `PlayAmbient`, `SetAudioGain`, `SetAudioEq`, `SetAudioAutomation`, `StopAudio`, `PauseAudio`, `ResumeAudio`, `SeekAudio`, `StopVoice`, `StopBGM`, `StopSFX`, `StopAmbient`
- `@quajs/plugin-animation`: `DefineAnimation`, `AnimationTimeline`, `Key`, `PlayAnimation`
- `@quajs/plugin-backlog`: `Backlog`, `NoBacklog`
- `@quajs/plugin-gallery`: `UnlockGallery`, `OpenGalleryScene`
- `@quajs/plugin-achievement`: `UnlockAchievement`, `OpenAchievementBoard`
- `@quajs/plugin-inventory`: `GrantInventoryItem`, `ConsumeInventoryItem`, `SetInventoryItemQuantity`

For detailed package usage, load the matching project skill such as `quajs-plugin-audio`, `quajs-plugin-background`, `quajs-character`, or `quajs-story-graph`.

## Decorator Activation

Resolution order:

1. Built-in engine decorators.
2. Explicit `decoratorMappings`.
3. Value imports in the current `.qs`/host module.
4. Auto-collected plugin decorators discovered from package metadata.

Local explicit activation example:

```qs
<script lang="ts">
import { decorators } from '@quajs/plugin-background'
</script>

@SetBackground('images/bg/station.jpg')
Narrator: The station returns.
```

Tooling config can disable auto-collection:

```json
{
  "decorators": {
    "autoCollect": false,
    "mappings": {
      "SetBackground": {
        "function": "setBackgroundWithEngine",
        "module": "@quajs/plugin-background"
      }
    }
  }
}
```

The same config shape is read from `quascript.config.json`, `qua.config.json#quascript`, and `package.json#quascript`.

## Story Metadata

Use story decorators to make routing and graph/tooling metadata visible:

```qs
@Chapter('chapter-1', { title: 'Chapter 1' })
@Scene('school')
@Entry('library-entry')
@Node('library', { title: 'Library', summary: 'Night route' })
@StoryTimeline('main-route')
@Protagonist('yuki')
@ChapterSelect({
  title: 'Opening',
  summary: 'The first morning.',
  order: 0,
  unlockOnVisit: true,
  lockedTitle: '???'
})
Yuki: We are here.
```

Story-point metadata becomes generated step metadata. Runtime package builds must preserve `contentPackageId` and required runtime package provenance.

## Audio Chapter Pattern

`@AudioChapter` can establish chapter defaults and a voice map. Dialogue without explicit `@PlayVoice` may resolve an implicit voice from the current chapter:

```qs
@AudioChapter('ch01', {
  bgm: 'audio/bgm/ch01.ogg',
  voiceMap: {
    'ch01:1': 'voice/ch01/yuki-001.ogg',
    'line-custom': 'voice/ch01/yuki-custom.ogg'
  }
})
@PlayBGM('audio/bgm/ch01.ogg', { loop: true })
Yuki: First mapped line.

@LineId('line-custom')
Yuki: Custom mapped line.
```

`@PlayVoice()` may omit the asset only when a current chapter voice map contains the resolved line id.

## Animation Pattern

Use `@AnimationTimeline(duration, wait?)` followed by `@Key(...)` for inline timelines. On dialogue lines, omitted key targets default to `character:<speaker>`.

```qs
@AnimationTimeline(600, true)
@Key('opacity', 0, 0)
@Key('opacity', 600, 1)
Unit7: I am here.

@AnimationTimeline(1200)
@Key('background:main', 'scale', 0, 1)
@Key('background:main', 'scale', 1200, 1.08, 'easeOutCubic')
Narrator: The room breathes.
```

Use `@DefineAnimation(id, duration)` plus `@PlayAnimation(id, ...bindings, wait?)` for reusable timelines.

## Boundaries

QuaScript should not grow into:

- a custom control-flow language;
- a plugin-extensible grammar surface;
- large imperative logic blocks;
- plugin-specific compiler branches;
- hidden syntax changed by installed plugins.

Plugins may provide runtime functions and decorator compilers owned by their package. They must not alter the QuaScript grammar or redefine core syntax.

When a need is stateful, algorithmic, reusable, or complex, implement it in TypeScript and call it from the `.qs` file.

## Demo story baseline

For `demo/` narrative work, read `demo/.agents/README.md` and its linked world, character, mystery, timeline, relationship, and prologue documents first. The current project is **明天，请再一次呼唤我 / Call Me Again Tomorrow**, with 神代凛 and Mara; the previous story and media have been retired. The shared Web/native story plugin executes 14 `.qs` modules spanning the prologue, seven chapters, epilogue and three endings. `demo-story` owns grouped saved choices, stable step IDs, ending resolution and load/menu-return continuation. Chapter replay restores chapter-start saves, never later choices. The current text is a complete first draft, shorter than the final expansion budget. Images are deferred by explicit user instruction; do not register planned media as integrated. Narration must remain speakerless, separate from character dialogue. Future-audio timestamps, knowledge, and relationship continuity must follow the archived story baseline.

## Authoring Rules

Prefer:

- dialogue in plain `Character: text`
- declarative stage/audio/animation/story metadata in decorators
- branching in choices
- short, named setup bindings
- compact decorator groups attached to their target

Do not hide primary story flow inside large helper calls when a normal dialogue/decorator/choice structure would be clearer.

Use `<script lang="ts">` for imports, exported `Scope`, shared constants, and helper declarations.

Use `<script setup lang="ts">` for local computed bindings consumed by dialogue text, decorator args, or choice conditions.

Prefer:

```qs
<script setup lang="ts">
const canEnterLibrary = scope.flags.libraryUnlocked && scope.time === 'night'
</script>

@Choice('Enter library', node('library'), { when: canEnterLibrary })
```

Over:

```qs
@Choice('Enter library', node('library'), { when: scope.flags.libraryUnlocked && scope.time === 'night' && complexCall(scope) })
```

If the condition is getting busy, name it in setup code.

Feature behavior comes from decorators and imported helpers, not from plugin-defined syntax.

Prefer domain-qualified names when a generic term could clash with another feature.

Examples:

- use `AnimationTimeline`
- use `StoryTimeline`
- do not overload a generic `Timeline`

Avoid:

- deeply nested object literals in-place when a named binding would read better
- long chains of opaque decorators with no clear grouping
- large amounts of business logic in `${...}`
- adding syntax where an imported TypeScript helper would work

## Recommended Patterns

Feature actions:

```qs
@SetBackground('bg/library-night.png')
@PlayBGM('bgm/night-theme.ogg')
@AnimationTimeline(360, true)
@Key('position.x', 0, -120)
@Key('position.x', 360, 0)
Yuki: It's quiet tonight.
```

Imported helpers:

```qs
<script lang="ts">
import { buildLibraryThumbnail } from './story-helpers'
</script>

<script setup lang="ts">
const thumbnail = buildLibraryThumbnail(scope.chapter)
</script>

@Choice('Inspect library', node('library'), {
  presentation: { thumbnail }
})
```

## Review Checklist

When reviewing a `.qs` file, ask:

- Is the primary story flow readable directly from the DSL?
- Is complex logic kept in TypeScript instead of growing the DSL?
- Are decorators actually activated by built-ins, explicit mappings, local imports, or auto-collect?
- Are plugin decorators handled by package-owned compiler entries instead of custom grammar?
- Are choice targets structured when runtime package, scene, script, or checkpoint semantics matter?
- Do story metadata and runtime package content preserve provenance?
- Would this feature be better expressed as an imported helper than as new syntax?
- Are timeline/story decorator names collision-resistant?
- If syntax, decorator behavior, or plugin usage changes, was the relevant project skill updated in the same change?

### Demo line editing

After changing narration person, re-read adjacent QS beats for speaker changes, prop custody, audio playback source and sitting/standing continuity. Keep observed facts distinct from Rin’s inference and remote reports; see `demo/.agents/third-person-continuation.md`. Do not mechanically replace every pronoun or invent a question to force the next dialogue line.

For the demo's multiple outfits, consult `demo/.agents/wardrobe.md`. Use explicit combined outfit/expression keys in QS, e.g. `@SetExpression('date-blush', 'mara')`, including every later expression in that scene. Do not infer clothes in the renderer, mutate global character profiles to retain a costume, or fall back to an old-outfit pose. Engine-owned expression keys already preserve the selected costume through saves and chapter entry. The demo now uses third-person limited narration centered on Rin; first-person words belong to character speech/messages. Keep the current authored cast rather than auto-showing a speaker, and do not prohibit Rin staging on the old first-person premise. Review implicit monologue and changing pronoun referents as well as literal 我; see `demo/.agents/third-person-review.md`. Keep wardrobe and the prose's pockets/buttons/outerwear consistent across each dated outing.

The latest demo authoring baseline also includes `demo/.agents/narrative-foundation.md`: opening context and overnight suspense now supersede the earlier same-night disclosure plan in QS. Consult `demo/.agents/manuscript-status.md` for integrated scope; do not count unexpanded scene-card budgets as prose, and do not add extra death-warning receptions that violate the fixed 24-hour window.

For manuscript expansion, use `demo/.agents/scene-plan.md` and `story-review.md`: the 89 main scenes (114.5k target) and three early-handoff scenes define the current expansion budget. The revised narrative chain is integrated but the 90–120k complete-route length is not achieved. New scene steps and the redesigned last two choices require updating current-version regression assertions. The unpublished demo explicitly permits breaking changes: no legacy step/save compatibility, migrations or revision-specific save databases. Never keep the old injury consequence behind the new early-handoff text, or count planned chapter budgets as existing QS prose.

For demo prose, follow `demo/.agents/writing-guide.md` including the current editing notes. Keep narrator observations separate from author commentary and UI instructions. Preserve evidence/branch semantics when simplifying choice labels. Demo prose can freely replace steps and IDs; old saves and implementations impose no compatibility requirements. Validate shared QS changes with the demo Web and native QuickJS builds and the existing three-ending story regression.

The demo now includes two independent, eight-scene minor mysteries before the death warning. Follow `demo/.agents/minor-mysteries.md` for source-date, human-origin and physical-object checks; the user authorizes additional low-stakes events within the established echo rules. Keep their scene prose in QS and preserve the normal-reading browser checks for discovery, investigation and closure.

The expanded demo prologue uses four existing QS modules and eleven scene cards. Research tenancy, ordinary signal reference samples and daily radio work precede the first anomaly; chapter01 must acknowledge that prior knowledge. Follow `demo/.agents/prologue.md`: ordinary old-file playback is not an additional echo. Its normal-reading regression runs through the same saved continuation and pipeline clicks as other content.

## Demo world and commission causality

For current demo writing, read `demo/.agents/world-causality-review.md` (paths relative to repository root). Archive restoration is commissioned by the station with library cultural funding and station move budget: exhibit candidates, authorized family copies and reusable editorial archives. It is independent of the research lease. Rin was recommended through a previous library job, assessed samples and accepted the assignment; Yumi assigns Mara for local source and location knowledge and reallocates everyday duties. Broadcast is an independently logged, replaceable test source over existing local lines, not magic archive fuel. Sea-sound Technology is the company; East Embankment is a facility location.

Keep the town routes and separate residences in worldbuilding. June16 Rin waits outside Mara's apartment after their harbor walk; June20 remains Mara's first entry into Rin's room. The death recording now names entrapment in ordinary maintenance space, unconscious rescue and severe smoke inhalation, with medical death confirmation at19:12; it does not provide a full electrical diagnosis or prove a locked door. Current site evidence, work orders and qualified inspection establish the risk path later. Retain the fixed single reception, source knowledge limits and consent/romance chronology. The current 89-card/114.5k budget uses 19k prologue, 12k chapter01, 11k chapter02, 19.5k chapter03, 10k chapter04, 12k chapter05, 11k chapter06, 13k chapter07 and 7k epilogue. Recount actual QS and run the shared native/Web compilation plus story regression after edits.

## Demo work shifts and off-duty life

Read `demo/.agents/work-and-off-duty.md` for the current dated roster and scene order. Normal day work is09:00–17:30 with meal breaks; specific evening checks use split shifts. Research staff preserve the fixed20:00–20:03 receptions and station staff rotate ordinary broadcasts; neither heroine must attend every night. June19/26/27 are full shared days off, June16 afternoon is off, June24 afternoon is recovery leave, June28 is morning acceptance only. June26 is Wednesday and27 Thursday, not a weekend.

Four additional scene cards are integrated: June11 Rin with the landlord after work, June15 Haruka's home street and family stationery shop, June17 Yumi's shopping between Rin's split shifts, June19 Rin's solo library/bus morning. Show individual purposes and environments; do not turn residents into interview targets or append a mystery to every outing. The off-duty round had81 main cards plus2 early-handoff cards; the warning/aftermath round had86 plus3; the current coherence revision has89 plus3, a114.5k single-route budget and14 QS modules.

June16's first personal invitation is now at Rin's lodging; its six-minute backup is her own project. June18 Rin hears an ordinary public web broadcast at home, and June19 the substitute editor forwards the service desk’s completed umbrella collection notice; no extra temporal reception or compulsory holiday office work. June20 noodles follow17:30 departure. June21's personal editing is17:45–18:45, so Rin cannot know that evening's future audio yet. June25 Rin submits her own application from home after work; June26 returns a privately borrowed record catalog, not station adapters. Maintain June19 name change, June20 first entry into Rin's room and June27 mutual confession. June23 remains an exceptional emergency, followed by actual rest.

The current19-case production story suite normally reads the new off-duty scenes and revised home/phone transitions, preserving all three endings and save/navigation checks. Its click bound is2400 for the longer sections, not a bypass of expected prose order. Recount QS, update current status and validate native QuickJS→remove generated native bootstrap→Web build→story regression after further changes.

## Near-future demo media logic

Read `demo/.agents/near-future-media.md` (repository-relative). The 2047 station distributes local programming through phones, connected cars and speakers with text/sources/corrections, alongside a limited FM service. Automation already handles routine transcription, scheduling and archives; show concrete local verification and individual listeners, not technological stagnation. The research lease buys a read-only output tap, space and independent logging/checking labor; existing wiring and cooperation make it economical, while another suitable source or documented network feed remains possible. Audio can carry encoded measurements; neither human voices nor old archives power the anomaly. Archive work selects problematic older digital and analog material for a funded exhibit, permitted family copies and editorial reuse. Separate enhancement from invented reconstruction, and let Rin and Mara verify names, dates and permissions through real tasks. These changes are in arrival, commission, restoration and chapter01; preserve prologue normal-reading assertions and refresh the count after edits.

## Progressive warning, deliberate concealment and aftermath

Read `demo/.agents/warning-and-aftermath.md` for the current integrated revision. A replacement monitor uses an obsolete channel table; local monitoring and preview inherit it, while independent raw channels remain intact. Distinguish the20:00–20:03 acquisition from20:12 identifiable fire/location,20:35 partial name/date and21:05 verified complete export. Each existing file is immutable; no generative word filling, extra temporal reception or signal becoming stronger near death. Report facility danger at20:12, share that clip with Mara, and treat Rin withholding later name/death details as her failure, not a necessary safety policy. July investigation closes the mundane channel-error question.

June20 resident follow-up precedes June23 investigation: a permitted passage signature was merged into a false complaint-resolution reply, and lawful drain-cleaning footage was cropped to suggest interference. Full records disprove that allegation; Reiko knowingly approved misleading documents, selected footage and extended unrepaired test exceptions. Mayu acknowledges her own temporary-test approval and lack of reinspection; Yumi corrects her unverified forwarding. Source-branch fire results from unisolated electrical danger, obstructed drainage and defective fire separation, not intentional ignition. Current-branch inspection cannot certify unseen source events or prosecute a death that did not occur. Preserve timely professional isolation.

The active plan is89 main cards/114.5k and3 handoff cards/3.6k (92 unique); chapter03 now19.5k, chapter07 now13k, epilogue7k, other totals unchanged. There remain14 QS modules and six choice groups. July residents' meeting and November final replies close accountability, corrective work, compensation and archive delivery, while September dating remains. Both complete evidence branches resolve their records; early handoff has the same public safety/accountability outcome and an open relationship. The chapter menu epilogue date spans June–November. Production regression now has19 cases, with new normal-reading checks of progressive understanding, allegation versus verified evidence, and later-life closure. Consult current manuscript status/count for measured prose and final validation.

## Current demo coherence revision

Read `demo/.agents/coherence-review.md` first for the latest integrated narrative baseline. All14 QS modules were reviewed for presence, knowledge, time and work continuity. Rin’s relocation-sound contract includes selected restoration/catalog work and the old-port feature mix/stems, with two paid field visits (June14/15). Mara handles recording/interviews, local sources and ordinary equipment liaison; Haruka handles introductions and everyday editing under Yumi, who commissions, schedules and approves. Limited source/interface checks are arranged work, not unlimited unpaid research. Mara’s June21 off-duty course sample is private; Haruka requests a20-second harbor excerpt June28 for the June30 feature.

Ordinary traffic, weather, public reporting and existing station material do not require individual resident approval on each use. Keep private family transfers and private conversations out of public programs unless that use is agreed. The birthday submission was broadcast last June; its family copy and dated replay are distinct uses. Do not turn every dialogue into a permission exchange.

June16 lunch establishes the four-person South Bay outing, confirmed June18. June19 Rin visits the library09:00–09:50, joins Mara/Haruka/Yumi at10:30, plays ball and shares lunch; Haruka/Yumi leave by13:20 bus for school work/dentist. The station has substitute coverage. Rin/Mara keep their prearranged14:00 lighthouse meeting and retrieve the stored ball afterward. The beach is now one compact node/card, with the other two1.5k budgets moved to the June26 cruise and cafe; there is no extra echo, recording assignment, swim rescue or early romantic name change.

The pump cools research equipment. Noise shows operation, not an electrical diagnosis. Preserve June12 complaint call, June20 owner’s visit about22:30–23:40 noise, early-shift spouse, ineffective daytime inspection, passage signature and water-damaged tools; the full passage form arrives that evening. June21 independent nighttime measurement leads to June22 advice against additional tests after22:00. This does not pre-cancel the18:40 acceptance or20:00 reception. June22 fire warning triggers overnight closure/main disconnection and auxiliary investigation. June23 new evidence proves continued use of a withdrawn reply, cropped footage and approvals; it is not the first discovery of the complaint. July/November close sleep, drainage, independent checks, corrections and actual payments.

Keep the normal-reading19-case story regression, including the single beach node through the lighthouse, June20 complaint, June26 cruise/cafe and June27 confession. Current scope is89 main cards/114.5k plus3 handoff cards/3.6k,92 unique cards; extra alternative budget5.55k. Actual complete-route prose90,205–90,288 has reached the90k lower bound but is not a finished literary manuscript. Recount and update status after QS changes; historical revision documents do not override this baseline.

## Varied demo leisure scenes

User correction: one June19 beach outing is enough. Keep `daily-beach-outing` as a condensed scene with gathering, a short ball game, lunch/photo and departure. Delete the separate beach-arrival/ball/lunch nodes and03-04f/g cards. Add `daily-harbor-cruise` and `daily-cafe-afternoon` in chapter07: June25 dinner invitation/booking; June26 10:30–11:10 public cruise around uninhabited White Island, lunch ashore, private shopping, cafe around14:20–15:30, then the existing street invitation for June27. No extra echo, water rescue, early confession or holiday work. This redistributes two1.5k budgets: chapter03 has19 cards/19.5k; chapter07 has10 cards/13k. Total89 main/114.5k plus3 handoff/3.6k remains. Keep normal-reading checks of each distinct outing into confession, and update counts; images remain deferred. See `demo/.agents/coherence-review.md` and current scene cards.

## Demo literary polish

The latest integrated prose pass is archived in `demo/.agents/prose-review.md`:79 passage edits across14 QS modules. Remove author explanations after already legible actions; do not mechanically ban “没有”, short replies, metaphors or reflective narration. Preserve Rin’s limited viewpoint and her self-justification while withholding the warning. Remote characters’ gestures cannot be narrated as observed; use audible pauses or received files. Differentiate professional voices by role and concrete tasks. Retain explicit mutual confession/consent, but give repeated intimate beats distinct reactions. Present aftermath accountability through the couple’s reading and questions without dropping compensation, correction, archive or source-branch limits. All nodes/choice IDs and chronology remain. Update existing normal-reading assertions when wording changes without weakening the evidence being checked; compile the same final QS for native/Web, run the19-case story regression, and refresh the measured-count archive.


## Demo plain Chinese review

Read `demo/.agents/plain-language-review.md` and `writing-guide.md` when revising demo prose. Use common Chinese collocations and explicit action/object phrases in dialogue, narration, choices and author-facing summaries. Distinguish checking a recording, inspecting a connector and confirming receipt instead of shortening every action to “核”. Use role-appropriate speech: private work can be “交作品”, contract dates can remain “交付日期”. Explain necessary technical conditions in context; retain both power-source isolation, remaining-energy disposal, local scheduled-test cancellation and independent site verification. Never replace these distinct facts with a vague “停了”. Check adjacent actions for causal sense, not only vocabulary. The audio verification choice now displays “先核对节目的原始录音”; its ID remains `verify-audio`. Update existing normal-reading assertions with wording changes, compile the same QS for native and Web, run the19-case production story regression, and refresh manuscript counts. Images remain deferred.


## Demo paragraph and continuity review

See `demo/.agents/narrative-flow-review.md`. Plain vocabulary alone does not make natural narrative: read adjacent replies, subject/object relationships, physical action order and Rin's knowledge together. Avoid narrator explanations that merely certify an already visible character arc. Keep necessary inner hesitation, source provenance and safety conditions. Track phones versus mouse input, handed objects, books already put away, and recorded versus directly visible actions. Original recordings permit remembered context only when Rin actually attended their creation; a future recording is not a person available for questions. Mara's June21 private course recording follows her existing admission and must not be relabeled as an admission application. Preserve explicit mutual confession and kiss consent without turning ordinary assistance into repeated formal permission dialogue. Check newly introduced prose for continuity before running final native/Web builds and the19-case production story regression; update manuscript measurements and current docs together.


## Demo full-manuscript continuity pass

Read `demo/.agents/full-read-review.md`. Audit source passages and alternate replies in context, including scene entry/exit, item custody, prior knowledge, dates inclusive of deadlines, first invitations and dialogue callbacks. Never give an unidentified recording a revealing speaker label; fragmented excerpts must preserve the full source's word order. Separate the fixed20:00–20:03 reception from later replay and discussion. After a local rewrite, recheck the adjacent actions: setting down a two-person equipment box precedes browsing books; lending a paper novel requires a separate reading source if its owner finishes it before return. Preserve Rin's limited viewpoint and the existing safety/romance rules. Update current narrative docs and measured counts with QS; an achieved length threshold does not prove scene-budget completion or literary quality.

Normal-reading browser checks must allow the revealed dialogue to paint before advancing again. Keep content/order assertions intact when improving frame synchronization, and validate the final compiled QS rather than a build predating the last prose correction.
