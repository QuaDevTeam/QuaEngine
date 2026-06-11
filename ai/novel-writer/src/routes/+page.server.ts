import type { PageServerLoad } from './$types'
import { listArtifacts, listProjects, listTrashedProjects, readConfig, readEvents, toPublicConfig } from '$server/store'

export const load: PageServerLoad = async () => {
  const projects = await listProjects()
  const selectedProject = projects[0]
  return {
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
