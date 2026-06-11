import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { approvalRequestSchema } from '$server/schemas'
import { isProjectRunning, recordApproval, startWorkflow } from '$server/workflow'
import { listArtifacts, readEvents, readProject } from '$server/store'

export const POST: RequestHandler = async ({ params, request }) => {
  const input = approvalRequestSchema.parse(await request.json())
  await recordApproval(params.projectId, input)
  let run: { runId: string } | undefined
  if (input.action === 'approve' && !isProjectRunning(params.projectId)) {
    const project = await readProject(params.projectId)
    run = await startWorkflow(params.projectId, project.mode)
    await waitForRunStarted(params.projectId, run.runId)
  }

  return json({
    ok: true,
    project: await readProject(params.projectId),
    artifacts: await listArtifacts(params.projectId),
    events: await readEvents(params.projectId),
    run,
  })
}

async function waitForRunStarted(projectId: string, runId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const events = await readEvents(projectId)
    if (events.some(event => event.type === 'run.started' && event.runId === runId)) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
