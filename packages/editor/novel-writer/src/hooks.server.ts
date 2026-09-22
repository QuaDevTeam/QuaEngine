import type { ServerInit } from '@sveltejs/kit'
import { stopService } from '$server/lifecycle'
import { activeSandboxCount, stopSandboxCommands } from '$server/sandbox'
import { appendEvent, listProjects, writeProject } from '$server/store'
import { activeWorkflowCount, settleWorkflows } from '$server/workflow'
import { activeAdaptationCount, settleAdaptations } from '$server/writing-adaptation'

export const init: ServerInit = async () => {
  if (process.env.NOVEL_WRITER_EMBEDDED !== '1')
    return
  // A crashed/closed service has no live agents. Preserve its checkpoints for resume.
  for (const project of await listProjects()) {
    if (project.status !== 'running')
      continue
    project.status = 'idle'
    await writeProject(project)
    await appendEvent({ projectId: project.id, type: 'run.failed', message: '上次写作任务已中断，可以从保存的检查点继续。' })
  }
  process.on('novel-writer:state', (reply: (state: { running: boolean }) => void) => {
    reply({ running: activeWorkflowCount() > 0 || activeSandboxCount() > 0 || activeAdaptationCount() > 0 })
  })
  process.on('novel-writer:shutdown', (finish: () => void) => {
    stopService()
    void Promise.allSettled([settleWorkflows(), stopSandboxCommands(), settleAdaptations()]).then(finish)
  })
}
