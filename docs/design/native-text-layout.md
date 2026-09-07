# Native dialogue typography and Web parity

Research and implementation baseline: 2026-09-07. The reference is the actual
`@quajs/renderer-web/plugins/dialogue` DOM with explicitly supplied theme styles.
A browser text engine has two related jobs: shaping glyphs and laying out CSS
boxes. Correct advances alone do not provide correct paragraphs or panel sizing.

## Reference rules

The Web plugin renders each rich block as `display: block` and each span as
`display: inline-block`. These spans are atomic boxes in the parent line, with
independent wrapping inside an oversized span. They are not continuous inline
text runs. Keep that distinction when comparing screenshots or considering a
replacement layout library.

| Property | Required behavior |
| --- | --- |
| `fontSize: 24` / `'24px'` | 24 logical stage units |
| `fontSize: '150%'` / `'1.5em'` | Resolve against the parent's computed font size |
| `lineHeight: 1.5` / `'1.5'` | Retain a multiplier; recompute for each descendant's font size |
| `lineHeight: '150%'` / `'1.5em'` | Compute an absolute length at the declaring element; descendants inherit that length |
| `lineHeight: 'normal'` | Use the selected QPK atlas font's ascent, descent and line gap |
| Mixed sizes/families | Align inline-blocks on their last in-flow line baseline; include the block's font strut in every row |
| Empty inline-block | No in-flow line or text baseline; its bottom edge participates in the parent's line box |
| `pre-wrap` | Preserve spaces and explicit breaks; permit soft wrapping and hanging trailing spaces |
| Reveal | Keep the full source for shaping/layout; expose only completed source clusters |

CSS line height is not a minimum font size. Half-leading can be negative:
`baseline = ascent + (lineHeight - ascent + descent) / 2`, with the native
font's descent stored as a negative value. A zero line height is valid; glyph
ink can overflow its line box. Panel sizing uses line boxes, not glyph ink bounds.

The TypeScript native serializer preserves document, block and span typography.
It converts numeric **Web** line heights to CSS number strings. Native JSON/Rust
numeric metrics continue to mean logical lengths; a native JSON `lineHeight: 36`
is 36 logical units, whereas `lineHeight: "1.5"` is a multiplier. `px`, `em`, `%`,
and unitless/`normal` line heights are validated at the JSON boundary. Unsupported
CSS expressions/units are diagnosed; this is not an unrestricted CSS parser.
Positive font-size limits and bounded computed relative products remain native
resource constraints. Relative line-height computations saturate at that limit.

## Pipeline and ownership

1. Consume the engine-owned dialogue projection and resolve computed typography:
   defaults → document → block → span. Speaker overrides apply after its document
   style, matching the Web plugin.
2. Retain full UTF-8 source and revealed prefixes in renderer draw data. Prewarm
   each block strut and full run's family/physical-size atlas bucket from QPK font
   bytes. Never rely on a revealed substring containing all needed glyphs.
3. Select the atlas, shape and measure text, resolve Unicode line breaks, then
   place atomic span boxes with shared baselines. `normal` resolves here, after
   the font is known. Measured height and glyph drawing call the same layout
   algorithm.
4. Resolve speaker height, body offset and body height; grow the bottom-anchored
   dialogue panel from its minimum height. Use the full available text width for
   speakers, including the reserved avatar column. Place choices above this
   measured panel.
5. Preserve glyph ink outside short/zero line boxes (`overflow: visible`); ancestor
   and stage scissors still clip painting. Convert logical units to physical pixels exactly once at the WGPU boundary.
   Font bucket choice uses that same physical scale. Clip and paint glyphs with
   transient GPU resources.

`NativeRenderBackend::measure_text_height` is an optional stateless measurement
hook. Before usable fonts exist, the builder keeps the bounded historical
estimate. After host font upload, `NativeRenderer::reflow_text` rebuilds the
prepared graph from the caller's still-borrowed projection, including summaries,
passes and pointer reconciliation. Retain the prepared frame's video resource
bindings during reflow so a just-published media frame cannot alter the already
synchronized resource plan. The app resubmits if reflow changes the graph,
even when other textures did not upload. Media planning and engine events are
not replayed. No view is retained as an additional source of game authority.

Subsequent frames measure against resident atlases during normal frame building;
package teardown continues to release fonts through existing resource lifecycle
hooks. The measurement hook does not fetch fonts or mount loose assets.

## Library evaluation

| Option | Useful capabilities | Integration implications |
| --- | --- | --- |
| Existing Rustybuzz + Unicode libraries + native atlas | OpenType shaping, glyph clusters, explicit package font loading, current WGPU rendering and cleanup | Retain for this increment; CSS inheritance, block struts and panel reflow belong around it |
| Parley | Styled paragraph layout, shaping, line breaking, inline boxes and layout results suitable for rendering | Candidate for a paragraph-layout adapter; still requires CSS computed values, the actual Web inline-block sizing/baseline rules, QPK font registration and deterministic unload |
| COSMIC Text | Shaping, font discovery/fallback, layout, optional rasterization and editing abstractions | Candidate for shared native UI text/editing work; avoid implicit system-font discovery and duplicate atlas/cache ownership; not a CSS box engine |
| Browser/DOM embedding | A full CSS implementation | Introduces a separate rendering/runtime stack; outside the current WGPU native renderer architecture |

Replacing the shaper alone would not fix the dropped block styles, CSS numeric
line-height conversion or the pre-measurement panel-size decision. Keep a clear
future seam: a paragraph input with computed styles and package font handles,
and output with glyph runs, source clusters, line metrics and bounds. Compare
that adapter with the current layout and browser fixtures before replacing the
implementation.

## Validation and remaining work

The rich-text audit asserts standards mode with an HTML DOCTYPE (quirks mode
changes strut/empty-line behavior) and lets Chrome compute panel auto-height and bottom anchoring
independently. Native estimated bounds are no longer fed into the browser. Both
sides use identical QPK font bytes; colored glyph positions test the resulting
vertical flow as well as local baselines. The test explicitly supplies the shared
panel typography/insets, since the Web renderer does not install visual CSS.
It is a typography/flow gate, not proof of every browser decoration or of visible
OS window presentation. Reports include the renderer's actual presentation status.

Unit coverage checks relative inheritance, malformed metrics, `normal`, empty
inline-block baselines, font-triggered panel shrink/growth, choice hit testing,
resource-plan stability and full-source reveal. Keep the full native demo E2E
alongside these focused checks.

Remaining typography work must be treated explicitly:

- Paragraph-scoped UAX #9 resolution followed by per-line visual reordering.
  Current line-local shaping/first-paragraph handling is insufficient for full
  RTL and cross-span bidi parity. Preserve paragraph context through wrapping.
- Script/language itemization and per-cluster **cross-family** fallback, including
  metrics from the selected fallback/weight face; current normal/strut metrics
  come from the selected family atlas. Do not call whole-run fallback full font
  fallback. Emoji/color glyphs also need a dedicated representation.
- Complete CSS whitespace processing (tabs, segment-break normalization and
  terminal-newline edge cases), language-sensitive line breaking/hyphenation,
  justification and overflow behavior. Unicode break opportunities are a base,
  not the entire CSS Text algorithm.
- Ruby, vertical writing, span/block transforms, decoration geometry and richer
  font synthesis. Preserve cluster identity through any future wrapping changes.
- Browser `normal` is font/platform dependent. Identical font bytes and tested
  platform metrics establish the comparison; a fixed multiplier cannot promise
  universal browser matching.

## Primary sources

- [CSS 2.2 §10.8: line height, struts, inheritance and inline-block baselines](https://www.w3.org/TR/CSS22/visudet.html#line-height)
- [CSS Text Level 3: whitespace processing and line breaking](https://www.w3.org/TR/css-text-3/)
- [CSS Inline Layout Level 3: font metrics, line gap and line-height contributions](https://www.w3.org/TR/css-inline-3/) — working-draft details require browser checks
- [Unicode UAX #9: paragraph bidi and line reordering](https://www.unicode.org/reports/tr9/)
- [Unicode UAX #14: line breaking](https://www.unicode.org/reports/tr14/)
- [Unicode UAX #29: grapheme boundaries](https://www.unicode.org/reports/tr29/)
- [HarfBuzz: working with clusters](https://harfbuzz.github.io/working-with-harfbuzz-clusters.html)
- [Parley API and overview](https://docs.rs/parley/latest/parley/)
- [COSMIC Text API and overview](https://docs.rs/cosmic-text/latest/cosmic_text/)

Downloaded research snapshots are local, reproducible evidence under
`packages/native/target/text-layout-research/`; source code and this decision
record are the durable repository artifacts.
