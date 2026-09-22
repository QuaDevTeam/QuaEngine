import type { NovelProject, ProjectSeed } from '$lib/types'

/** Missing fields only. Existing canon and generated settings retain precedence. */
export function mergeEditorContext(project: NovelProject, input: { root: string, seed: ProjectSeed }, generated: Set<string>): NovelProject {
  if (project.editorRoot && project.editorRoot !== input.root)
    throw new Error('此写作项目已关联另一个 editor 项目。')
  const seed = { ...project.seed }
  for (const field of ['worldbuilding', 'characters', 'outline'] as const) {
    if (!seed[field]?.trim() && !generated.has(field)) seed[field] = input.seed[field]
  }
  return { ...project, editorRoot: input.root, seed, updatedAt: new Date().toISOString() }
}
