import type { PreviewBuildProgress } from '@quajs/editor-core'
import { stripVTControlCharacters } from 'node:util'

/** Stage evidence comes from build output, never elapsed-time percentages. */
export class NativeBuildProgress {
  private tail = ''
  private latest: PreviewBuildProgress = { stage: 'build', label: '正在运行 Native 构建脚本' }
  private timer?: ReturnType<typeof setTimeout>
  constructor(private readonly report: (progress: PreviewBuildProgress) => void) {
    report(this.latest)
  }

  append(chunk: string): void {
    const lines = (this.tail + stripVTControlCharacters(chunk)).split(/[\r\n]+/u)
    this.tail = lines.pop()!.slice(-2048)
    let next = this.latest
    for (const line of lines) {
      const detail = line.trim()
      if (!detail)
        continue
      if (/Building native TypeScript renderer contracts/iu.test(detail))
        next = { stage: 'contracts', label: '构建 TypeScript 依赖与渲染契约' }
      else if (/Bundling .*JavaScriptCore/iu.test(detail))
        next = { stage: 'scripts', label: '编译剧本与 JavaScriptCore 应用' }
      else if (/Building .*QPK|workspace:bundle/iu.test(detail))
        next = { stage: 'assets', label: '打包资源与 QPK' }
      else if (/Compiling |Checking |cargo (?:run|build)|Finished .* (?:target|profile)/u.test(detail))
        next = { stage: 'native', label: '编译 Native 程序' }
      else if (/Launching complete native|Native CDP endpoint/iu.test(detail))
        next = { stage: 'connect', label: '启动 Native 并等待预览连接' }
      next = { ...next, detail: detail.slice(-240) }
    }
    if (next !== this.latest) {
      const stageChanged = next.stage !== this.latest.stage
      this.latest = next
      if (stageChanged) {
        clearTimeout(this.timer)
        this.timer = undefined
        this.report(next)
      }
      else if (!this.timer) {
        this.timer = setTimeout(() => {
          this.timer = undefined
          this.report(this.latest)
        }, 100)
      }
    }
  }

  dispose(): void {
    clearTimeout(this.timer)
    this.timer = undefined
  }
}
