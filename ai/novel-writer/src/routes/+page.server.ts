import type { PageServerLoad } from './$types'
import { listProjects, listTrashedProjects, readConfig, toPublicConfig } from '$server/store'

export const load: PageServerLoad = async () => {
  return {
    config: toPublicConfig(await readConfig()),
    projects: await listProjects(),
    trashedProjects: await listTrashedProjects(),
  }
}
