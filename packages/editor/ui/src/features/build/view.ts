import type { EditorBuildState, EditorBuildStep } from '@quajs/editor-core'
import { buttonView, disclosure, field, html, iconButtonView, nothing, repeat } from '@quajs/editor-controls'
import { guard } from 'lit/directives/guard.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { icon } from '../../shared/icons'
import { buildLogView } from './log'

interface BuildView {
  project: string
  target: HTMLSelectElement
  state?: EditorBuildState
  steps: EditorBuildStep[]
  busy: boolean
  cancelling: boolean
  error: string
  preparing: string
  startedAt?: number
  logsOpen: boolean
  canBuild: boolean
  close: () => void
  start: () => void
  cancel: () => void
  reveal: () => void
  toggleLogs: (open: boolean) => void
}
const phaseLabels = { pending: '等待', running: '进行中', completed: '完成', skipped: '已跳过', error: '失败', cancelled: '已取消' }
function duration(start: number, end = Date.now()): string {
  const seconds = Math.max(0, Math.floor((end - start) / 1000))
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, '0')} 秒`
}

function stepView(step: EditorBuildStep, index: number, stopped: boolean) {
  const active = step.phase === 'running'
  const expanded = active || step.phase === 'error' || step.phase === 'cancelled' || step.phase === 'skipped'
  return html`<li data-phase=${step.phase} aria-current=${active ? 'step' : nothing}>
    <span class="build-step-marker" aria-hidden="true">${step.phase === 'completed' ? '✓' : step.phase === 'skipped' ? '−' : step.phase === 'error' ? '!' : index + 1}</span>
    <div class="build-step-copy"><div class="build-step-heading"><span>${step.title}</span>
      <span class="build-step-meta">${stopped && step.phase === 'pending' ? '未执行' : phaseLabels[step.phase]}${step.startedAt !== undefined ? html`<time>${duration(step.startedAt, step.finishedAt)}</time>` : nothing}</span></div>
      ${expanded ? html`<p>${step.detail || step.description}</p>` : nothing}
      ${active && step.total ? html`<div class="build-bundle-progress"><progress max=${step.total} value=${step.completed ?? 0} aria-label="资源包完成进度"></progress><span>${step.completed ?? 0} / ${step.total} 个资源包</span></div>` : nothing}
    </div></li>`
}

export function productionBuildView(view: BuildView) {
  const { state, steps, busy } = view
  const completed = steps.filter(step => step.phase === 'completed').length
  const skipped = steps.filter(step => step.phase === 'skipped').length
  const status = view.cancelling ? '正在取消，等待构建进程退出…' : view.error ? '无法完成打包' : state?.message ?? (busy ? view.preparing : '准备就绪')
  const sign = state?.signing === 'adhoc' ? '本机临时签名' : state?.signing === 'developer-id' ? 'Developer ID 签名' : ''
  return html`<header class="build-header"><div><h2 id="production-build-title">生产打包</h2><p>${view.project}</p></div>
    ${iconButtonView('关闭打包面板', html`${unsafeHTML(icon('close'))}`, view.close, { size: 'comfortable' })}</header>
    <div class="build-body">
      <div class="build-target" data-control-size="comfortable">${field('构建目标', view.target, { layout: 'row' })}<span>${view.target.value === 'native' ? '可执行的 .app 应用' : '可部署的静态网站'}</span></div>
      <section class="build-overview" data-phase=${view.error ? 'error' : state?.phase ?? 'ready'} aria-label="打包进度">
        <div><strong role="status">${status}</strong>${view.startedAt ? html`<span class="build-elapsed">耗时 ${duration(view.startedAt, state?.finishedAt)}</span>` : nothing}</div>
        <progress max=${steps.length} value=${completed + skipped} aria-label="构建步骤完成进度" aria-valuetext=${`已完成 ${completed} 步，跳过 ${skipped} 步，共 ${steps.length} 步`}></progress>
        <div class="build-progress-caption"><span>已完成 ${completed} / ${steps.length} 步${skipped ? `，跳过 ${skipped} 步` : ''}</span><span>${busy ? '正在构建' : state?.phase === 'completed' ? '构建完成' : '构建步骤'}</span></div>
      </section>
      ${view.error ? html`<p class="build-error" role="alert">${view.error}</p>` : nothing}
      <ol class="build-steps" aria-label="构建步骤">${repeat(steps, step => step.id, (step, index) => stepView(step, index, state?.phase === 'error' || state?.phase === 'cancelled'))}</ol>
      ${state?.artifact ? html`<div class="build-output"><strong>产物已生成</strong><code>${state.artifact}</code>${sign ? html`<span>${sign}${state.notarized ? '，已通过 Apple 公证' : ''}</span>` : nothing}</div>` : nothing}
      ${disclosure(html`构建日志<span>${state?.phase === 'error' ? '查看错误详情' : '详细输出'}</span>`, html`<pre tabindex="0" aria-label="构建日志">${guard([state?.log], () => state?.log ? buildLogView(state.log) : '构建开始后，详细日志会显示在这里。')}</pre>`, { className: 'build-log', open: view.logsOpen, onToggle: view.toggleLogs })}
    </div>
    <footer class="build-footer"><span>${busy ? '可关闭面板，在后台继续构建。' : '图标、签名和公证使用项目配置。'}</span><div>
      ${buttonView(busy ? '后台运行' : '关闭', view.close, { variant: 'quiet', size: 'comfortable' })}
      ${state?.phase === 'building'
        ? buttonView(view.cancelling ? '正在取消…' : '取消打包', view.cancel, { variant: 'danger', size: 'comfortable', busy: view.cancelling, icon: html`${unsafeHTML(icon('stop'))}` })
        : buttonView(state?.artifact ? '再次打包' : state?.phase === 'error' || state?.phase === 'cancelled' ? '重新打包' : busy ? '正在准备…' : '开始打包', view.start, { variant: state?.artifact ? 'default' : 'primary', size: 'comfortable', disabled: !view.canBuild, busy, icon: html`${unsafeHTML(icon(state ? 'refresh' : 'package'))}` })}
      ${state?.artifact ? buttonView('显示产物', view.reveal, { variant: 'primary', size: 'comfortable', icon: html`${unsafeHTML(icon('folderOpen'))}` }) : nothing}
    </div></footer>`
}
