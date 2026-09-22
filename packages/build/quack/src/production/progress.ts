export type QuaProductionBuildStep = 'prepare' | 'compile' | 'bundle' | 'runtime' | 'manifest' | 'executable' | 'icon' | 'sign' | 'notarize' | 'publish'

/** Stage completion is reported only after the corresponding operation succeeds. */
export interface QuaProductionBuildProgress {
  version: 1
  step: QuaProductionBuildStep
  status: 'running' | 'completed' | 'skipped'
  detail?: string
  completed?: number
  total?: number
}

export type QuaProductionProgressListener = (event: QuaProductionBuildProgress) => void

export function productionProgress(listener?: QuaProductionProgressListener) {
  return (step: QuaProductionBuildStep, status: QuaProductionBuildProgress['status'], detail?: string, count?: { completed: number, total: number }): void => {
    listener?.({ version: 1, step, status, detail, ...count })
  }
}
