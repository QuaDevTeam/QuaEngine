import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { applyProjectInputUpdate, hasContentAffectingChanges } from '$server/project-input'
import { updateProjectInputSchema } from '$server/schemas'
import { isProjectRunning, startProjectRevision } from '$server/workflow'
import { listArtifacts, readEvents, readProject, trashProject, updateProjectInput } from '$server/store'

export const GET: RequestHandler = async ({ params }) => {
  const project = await requireProject(params.projectId)
  const artifacts = await listArtifacts(params.projectId)
  const events = await readEvents(params.projectId)
  return json({ project, artifacts, events })
}

export const DELETE: RequestHandler = async ({ params }) => {
  const project = await requireProject(params.projectId)
  if (project.status === 'running' || isProjectRunning(params.projectId)) {
    return json({ error: 'Cannot delete a running project.' }, { status: 409 })
  }

  const trashedProject = await trashProject(params.projectId)
  return json({ trashed: true, project: trashedProject })
}

export const PUT: RequestHandler = async ({ params, request }) => {
  const project = await requireProject(params.projectId)
  if (project.status === 'running' || isProjectRunning(params.projectId)) {
    return json({ error: 'Cannot edit a running project.' }, { status: 409 })
  }

  const input = updateProjectInputSchema.parse(await request.json())
  const { project: nextProject, revision } = applyProjectInputUpdate(project, input)
  if (!revision.changedFields.length) {
    const artifacts = await listArtifacts(params.projectId)
    const events = await readEvents(params.projectId)
    return json({
      project,
      artifacts,
      events,
      changedFields: [],
      revisionStarted: false,
    })
  }

  const updatedProject = await updateProjectInput(nextProject, revision.changedFields)
  const artifacts = await listArtifacts(params.projectId)
  const shouldRevise = artifacts.length > 0 && hasContentAffectingChanges(revision)
  if (shouldRevise) {
    await startProjectRevision(params.projectId, revision)
  }

  return json({
    project: updatedProject,
    artifacts,
    events: await readEvents(params.projectId),
    changedFields: revision.changedFields,
    affectedStages: revision.affectedStages,
    revisionStarted: shouldRevise,
  })
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

function isNotFound(caught: unknown): boolean {
  return Boolean(caught && typeof caught === 'object' && 'code' in caught && caught.code === 'ENOENT')
}
