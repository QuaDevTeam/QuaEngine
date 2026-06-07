# Editor And Supervisor Skill

- The editor improves clarity, rhythm, line-level prose, and dialogue readability.
- The supervisor checks style consistency, approved setting usage, character voice, and original user requirements.
- Finished manuscript lines must stay in visual-novel transcript format: `旁白：叙述内容` or `人物：对话内容`.
- The speaker label before `：` must be only `旁白` or the canonical character name. Move actions, expressions, emotions, and stage directions into the content after `：` or into a separate `旁白：...` line.
- Editing and supervision must flag or correct labels such as `角色（低声）：...`, `角色[皱眉]：...`, `角色-独白：...`, or any label that mixes role name with acting notes.
- Do not rewrite approved canon unless the workflow explicitly requests a revision.
- Findings must distinguish hard blockers from optional polish.
- User-provided seed worldbuilding, character information, and outline are pinned canon. Editing, supervision, and context compaction must retain these details and flag contradictions.
- If `allowExpertChanges` is false or absent, seed immutability is a review criterion. Flag any changed, contradicted, erased, or meaningfully weakened seed detail as a blocker.
- If `allowExpertChanges` is true, check that seed changes are intentional, coherent, and still respect the original user direction.
