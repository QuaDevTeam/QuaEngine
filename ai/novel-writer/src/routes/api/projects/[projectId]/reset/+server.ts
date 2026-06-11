import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { isProjectRunning, startWorkflow } from '$server/workflow'
import { listArtifacts, readEvents, readProject, resetProjectRuntimeData } from '$server/store'

export const POST: RequestHandler = async ({ params }) => {
  const project = await requireProject(params.projectId)
  if (project.status === 'running' || isProjectRunning(params.projectId)) {
    return json({ error: 'Cannot reset a running project.' }, { status: 409 })
  }

  const resetProject = await resetProjectRuntimeData(params.projectId)
  const run = await startWorkflow(params.projectId, resetProject.mode)
  const events = await waitForRunStarted(params.projectId, run.runId)
  return json({
    project: await readProject(params.projectId).catch(() => resetProject),
    artifacts: await listArtifacts(params.projectId),
    events,
    run,
  }, { status: 202 })
}

async function requireProject(projectId: string) {
  try {
    return await readProject(projectId)
  }
  catch (caught) {
    if (isNotFound(caught)) {
      error(404, 'Project not found.')
    }
    throw caught
  }
}

async function waitForRunStarted(projectId: string, runId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const events = await readEvents(projectId)
    if (events.some(event => event.type === 'run.started' && event.runId === runId)) {
      return events
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  return readEvents(projectId)
}

function isNotFound(caught: unknown): boolean {
  return Boolean(caught && typeof caught === 'object' && 'code' in caught && caught.code === 'ENOENT')
}
