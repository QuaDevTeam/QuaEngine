import type { QuaProductionBuildProgress } from '@quajs/quack/project'

/** Bounded NDJSON decoding over fd 3. Human logs can never advance a step. */
export class BuildProgressDecoder {
  private pending = ''
  private discarding = false
  constructor(private readonly steps: ReadonlySet<string>, private readonly receive: (event: QuaProductionBuildProgress) => void) {}

  append(chunk: string): void {
    for (const part of chunk.split(/(?<=\n)/u)) {
      if (!this.discarding) {
        this.pending += part
        if (this.pending.length > 16384) {
          this.pending = ''
          this.discarding = true
        }
      }
      if (!part.endsWith('\n'))
        continue
      if (!this.discarding)
        this.line(this.pending)
      this.pending = ''
      this.discarding = false
    }
  }

  private line(text: string): void {
    let event: QuaProductionBuildProgress
    try {
      event = JSON.parse(text)
    }
    catch { return }
    if (!event || event.version !== 1 || !this.steps.has(event.step) || !['running', 'completed', 'skipped'].includes(event.status))
      return
    if (event.detail !== undefined && (typeof event.detail !== 'string' || event.detail.length > 512))
      return
    if (event.completed !== undefined || event.total !== undefined) {
      if (!Number.isSafeInteger(event.completed) || !Number.isSafeInteger(event.total)
        || event.completed! < 0 || event.total! < 1 || event.completed! > event.total! || event.total! > 1000000) {
        return
      }
    }
    this.receive(event)
  }
}
