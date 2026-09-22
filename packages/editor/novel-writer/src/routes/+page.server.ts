import type { PageServerLoad } from './$types'
import { readProjectDraft } from '$server/project-draft'
import { listArtifacts, listProjects, listTrashedProjects, readConfig, readEvents, toPublicConfig } from '$server/store'

export const load: PageServerLoad = async () => {
  const projects = await listProjects()
  const selectedProject = projects[0]
  return {
    embedded: process.env.NOVEL_WRITER_EMBEDDED === '1',
    projectDraft: process.env.NOVEL_WRITER_EMBEDDED === '1' ? await readProjectDraft() : undefined,
    config: toPublicConfig(await readConfig()),
    projects,
    trashedProjects: await listTrashedProjects(),
    selectedProjectDetail: selectedProject
      ? {
          project: selectedProject,
          artifacts: await listArtifacts(selectedProject.id),
          events: await readEvents(selectedProject.id),
        }
      : undefined,
  }
}
