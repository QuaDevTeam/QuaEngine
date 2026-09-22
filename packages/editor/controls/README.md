# Editor controls

`@quajs/editor-controls` provides native controls and Lit Web Components and shared form tokens for
the desktop workbench and its editor plugins. Lit is its only runtime UI dependency; it has no engine, host
or filesystem dependency. MPL-2.0; see LICENSE and NOTICE.

Import `@quajs/editor-controls/styles.scss` explicitly once in the host. Use
`.editor-ui` on the workbench body or `.editor-controls` on a standalone panel.

Dialogs and popovers share `--editor-dialog-radius` (12px); buttons, icon actions, inputs and selects use `--editor-radius` (6px). Dialog-specific layouts should retain visible header/actions and scroll the body when space is constrained.
The host also gives existing native form markup the same baseline. Monaco,
xterm and game stage controls are excluded. The isolated Svelte Novel Writer
uses its own shadcn components; do not inject this stylesheet into its document.

```ts
import { button, field, html, input, render, section } from '@quajs/editor-controls'

const duration = input(1000, value => updateDraft(Number(value)), {
  type: 'number',
  min: 1,
  max: 60000,
})
render(html`${section('动画', field('时长', duration, { unit: 'ms', accessibleName: '时长 ms' }), button('应用到源文件', applyDraft, 'primary'))}`, host)
```

Factories return native elements; use their `disabled`, `readOnly`, `required`,
`name`, `id`, `title`, and event APIs directly. `input` commits on `change` only
after native validation; empty/nonfinite numeric drafts do not become zero.
For live text editing, attach `input`/`compositionend` with the caller's IME and
source revision guards. Do not rebuild a focused form on background refresh.

Use `buttonView` in reactive templates; `button()` delegates to the same markup
for imperative integrations. Options include `variant`, `size` (`compact` or
`comfortable`), `icon`, `busy`, `disabled`, `type`, `id`, `title` and a layout-only
`className`. Busy buttons expose `aria-busy`, show a shared spinner and disable
activation. Labels remain escaped text. Use one primary action per action group;
secondary actions use default/quiet and cancellation uses danger. Keep native
submit semantics explicit with `type: 'submit'`. State updates retain the button
node. Reduced-motion settings disable the spinner and color transitions.

Set `data-control-size="comfortable"` on a form group to align inputs/selects
with 32px dialog buttons. Toolbars retain their explicit square icon size. Local
feature styles arrange controls rather than redefining their borders, backgrounds,
padding or radius. Scope status-bar styles to `.workbench-statusbar`; never use
global `footer button` rules that would override dialog actions.

| API                                         | Responsibility                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `emptyState(title, description?, actions?)` | Empty surface with optional symbol, status copy and native actions        |
| `button(label, action, variant?)`           | `type=button`; default, primary, quiet, danger                            |
| `buttonView(label, action?, options?)`      | Reactive native button template with variants, icons, busy/disabled state and sizes |
| `iconButtonView(label, icon, action?, options?)` | Shared square action with required accessible label and tooltip |
| `input(value?, changed?, options?)`         | Text/search/password/url/number/range; optional bounds, step, placeholder |
| `select(options?, value?, changed?)`        | Native keyboard popup; string or `{value,title}` options                  |
| `checkbox(checked?, changed?)`              | Native checkbox with boolean callback                                     |
| `textarea(value?)`                          | Multiline control; caller owns live commits                               |
| `field(label, control, options?)`           | Label association, unique ID, row/stack/inline layout, optional unit      |
| `section(title, ...children)`               | Named property group with semantic heading                                |
| `disclosure(summary, content, options?)`    | Native details/summary with retained children and optional height transition |

`disclosure` returns a Lit template. Leave `open` undefined for native retained
state, or pass `{ open, onToggle }` when a controller owns it. `summary` accepts
text or a template; `content` accepts a template or existing controls. Keep
interactive actions outside the summary. Optional `className` is for layout;
`transition` defaults to true and can be disabled per instance. The intrinsic
height and chevron use `--editor-disclosure-duration` (180ms), honoring OS and
editor reduced-motion preferences. Unsupported browsers fall back to native
instantaneous disclosure. Closing never unmounts child controls or loses drafts.
Build logs and search include/exclude options use the same component.

```ts
render(disclosure('高级选项', html`${field('文件类型', input('*.qs'))}`, {
  open: expanded,
  onToggle: value => { expanded = value },
}), host)
```

Use `.editor-actions` for action rows. Template-only markup may use the matching
classes, but must preserve label/ID associations and button types. Unit suffixes
are decorative; include necessary units in the accessible name. Additional
actions belong beside a field, never inside its label.

Use `.icon-button` for icon-only actions, with `title` and `aria-label`. Its
shared square hit area does not flex or shrink. Set `--editor-icon-button-size`
for compact toolbars instead of overriding width, height or padding separately.
Keep the select chevron and its text clearance when adjusting surfaces: use
`background-color`, not the `background` shorthand that resets its image.

Dimensions live in `src/styles.scss`: 26px compact controls, 32px comfortable actions, 6px corners and 4/8/12/16px spacing.
Semantic color tokens live in `src/themes.scss`, included by the host stylesheet. Panel CSS owns layout and
specialized interactions only. Do not redefine whole-panel input/button skins.
New shared states or variants belong here. See the repository skill
`.codex/skills/qua-editor-development-guardrails/SKILL.md` for implementation and
validation rules.

Run `pnpm --filter @quajs/editor-controls test`, `typecheck`, `build`, and `lint`;
then rebuild consumers and run the affected Electron smoke. Shared form visual
coverage is in `packages/editor/electron/scripts/controls-smoke.mjs`.

`emptyState` returns `{ element, symbol, heading, detail, actions }`. Add the existing
feature icon to `symbol`; set `element.dataset.compact` for sidebars. Callers own
visibility and context-specific copy. Use it for a dedicated empty surface, not
for inline warnings. Keep console placeholders outside raw log content.

Bottom panels opt into `container: editor-panel / size`; below 190px tall, empty
surfaces use a compact horizontal layout so descriptions and actions remain visible.

`qua-field`, `qua-property-section` and `qua-empty-state` use Lit in light DOM. Factories return initialized elements so imperative feature controllers retain their existing input/event lifecycle. Source styles are SCSS; package builds also emit browser-ready `dist/styles.css`.

`EditorElement` is the shared light-DOM Lit base. The package re-exports `html`,
`render`, `nothing`, `repeat`, `live`, `ref`, `createRef` and `styleMap` for plugin
views. Use stable keys for changing lists. The native factories are adapters for
controllers that retain native input refs; new views should prefer templates.
`element(template)` accepts exactly one root and is intended for virtualized rows
or persistent integration hosts. Update a render root only through Lit, and clear
it with `render(nothing, host)`. Do not replace its child nodes manually.

The host selects the palette with `html[data-color-theme="qua" | "graphite"]`
and resolves `html[data-theme="light" | "dark"]` from the profile's light/dark/system
preference. Qua is the default, aligned with the documentation site's warm paper
and rose accent; Graphite is a neutral alternative. Standalone popout chrome can
import `@quajs/editor-controls/themes.scss` for tokens without the form baseline.
Plugins inherit `--editor-*` colors and must not reset them to a private dark palette.
Use semantic `text`, `muted`, `surface`, `input-bg`, `selection`, `accent`,
`primary`/`on-primary`, `danger`, `warning` and `success` tokens, including their
background variants. Keep asset pixels and embedded game/writer documents separate.
Canvas/native integrations resolve computed tokens and repaint on theme changes;
Monaco and xterm keep their existing instances. `theme-smoke.mjs` checks live mode
changes, contrast, plugin drafts, terminal identity and popout synchronization.
