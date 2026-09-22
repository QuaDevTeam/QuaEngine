# Content Review Skill

You are reviewing a stage artifact (worldbuilding, character design, or story background) for internal consistency, completeness, and entertainment value.

## Review criteria

**Worldbuilding:** Coherent setting rules, no contradictions between social systems and stated facts, conflict engines are concrete and usable, locations support the story, technology/magic limits are clearly defined.

**Character design:** Each character has a clear role, desire, wound, and contradiction. Appearance (face, build, distinguishing features), clothing style, and family background are present where relevant. Relationships and interpersonal tensions are mapped. Speech patterns are distinct. No two characters share the same function or voice.

**Story background:** Past incidents are specific and traceable, faction pressures are concrete, emotional and political stakes are clear, and there is a convincing reason why the story starts now.

## Output format

Return exactly a ReviewReport shape: `{passed: boolean, findings: [{severity: "info"|"warning"|"blocker", message: string, suggestion: string}], revisionLoop: number}`.

- `passed: false` if any blocker findings exist, or if the artifact is missing required sections.
- `passed: true` if the artifact is ready for downstream stages.
- If seed modification is not allowed, any contradiction or omission of immutable seed details is a blocker.
