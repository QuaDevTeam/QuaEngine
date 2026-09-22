/** Renderer-local measurements; null means unavailable or still warming up. */
export interface PreviewPerformance {
  sessionId: string
  target: 'web' | 'native'
  timestamp: number
  fps: number | null
  fpsSource: string
  cpuPercent: number | null
  memoryBytes: number | null
  frameMs: number | null
  frameAgeMs: number | null
  jsHeapBytes: number | null
  gpuMemoryBytes: number | null
  gpuMemorySource: string
  gpuPercent: number | null
  gpuSource: string
  drawCalls: number | null
  renderPasses: number | null
}
export type PreviewPerformanceReading = Omit<PreviewPerformance, 'sessionId' | 'target' | 'timestamp'>
