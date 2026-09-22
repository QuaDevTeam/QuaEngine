import type {
  EditorBridge,
  EditorProject,
  EditorPublication,
  EditorPublishingState,
  EditorSourceEdit,
} from '@quajs/editor-core'
import { element, html, nothing, render } from '@quajs/editor-controls'

const statusText = {
  pending: '待复核',
  approved: '已上架',
  rejected: '未通过',
  suspended: '已暂停',
}
export class PluginPublisherView {
  readonly host = element(html`<section class="market-detail plugin-publisher"></section>`)
  private project?: EditorProject
  private state?: EditorPublishingState
  private prepared?: EditorPublication
  private busy = false
  private generation = 0
  private pollTimer?: ReturnType<typeof setTimeout>
  private message = ''
  private readonly otp = element<HTMLInputElement>(html`<input>`)
  constructor(
    private readonly bridge: EditorBridge,
    private readonly applyEdit: (edit: EditorSourceEdit) => Promise<void>,
  ) {
    this.host.hidden = true
    this.otp.type = 'password'
    this.otp.inputMode = 'numeric'
    this.otp.autocomplete = 'one-time-code'
    this.otp.placeholder = 'npm OTP（需要时填写）'
    this.otp.setAttribute('aria-label', 'npm 一次性验证码')
    window.addEventListener('beforeunload', () => clearTimeout(this.pollTimer))
  }

  update(project: EditorProject): void {
    if (this.project?.root !== project.root) {
      this.generation++
      this.prepared = undefined
      this.state = undefined
      this.message = ''
      this.otp.value = ''
    }
    this.project = project
  }

  async refresh(): Promise<void> {
    const root = this.project?.root
    if (!root || this.busy)
      return
    const generation = ++this.generation
    this.host.setAttribute('aria-busy', 'true')
    try {
      const state = await this.bridge.pluginPublishingState(root)
      if (generation !== this.generation)
        return
      this.state = state
      this.render()
    }
    catch (error) {
      if (generation === this.generation) {
        this.message = String(error)
        this.render()
      }
    }
    finally {
      this.host.removeAttribute('aria-busy')
    }
  }

  private button(
    label: string,
    action: () => Promise<void>,
    disabled = false,
    primary = false,
  ) {
    return html`<button type="button" class=${primary ? 'primary' : ''} ?disabled=${disabled || this.busy} @click=${() => void this.run(action)}>${label}</button>`
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy)
      return
    this.busy = true
    this.message = '正在处理…'
    this.render()
    try {
      await action()
    }
    catch (error) {
      this.message = error instanceof Error ? error.message : String(error)
    }
    finally {
      this.busy = false
      this.render()
      this.host
        .querySelector('.publisher-artifact')
        ?.scrollIntoView({ block: 'nearest' })
    }
  }

  private async login(): Promise<void> {
    clearTimeout(this.pollTimer)
    const login = await this.bridge.pluginLogin()
    this.message = `请在浏览器确认登录，授权码 ${login.userCode}。`
    const expires = Date.now() + login.expiresIn * 1000
    const poll = async () => {
      if (Date.now() >= expires) {
        this.message = '登录请求已过期，请重新登录。'
        this.render()
        return
      }
      try {
        const account = await this.bridge.pollPluginLogin()
        if (account) {
          this.message = `已登录 ${account.login}`
          await this.refresh()
          return
        }
        this.pollTimer = setTimeout(() => void poll(), 5000)
      }
      catch (error) {
        this.message = String(error)
        this.render()
      }
    }
    this.pollTimer = setTimeout(() => void poll(), 5000)
  }

  private render(): void {
    const state = this.state
    const project = state?.project ?? this.project?.pluginProject
    const submission = state?.submissions.find(item => item.name === project?.name)
    const artifact = this.prepared
    render(html`
      <h2>发布插件</h2><p class="market-detail-description">发布到 npm，加入 QuaEngine 插件市场。</p>
      <div class="publisher-account"><div><strong>${state?.account ? `@${state.account.login}` : 'Registry 账号'}</strong><small>${state?.registryUrl || '尚未配置 Registry 地址'}</small></div>
        <div class="market-actions">${state?.account
          ? this.button('退出登录', async () => {
              clearTimeout(this.pollTimer)
              await this.bridge.pluginLogout()
              this.state = { ...state, account: undefined, submissions: [] }
              this.message = '已退出登录'
            })
          : this.button('使用 GitHub 登录', () => this.login(), !state?.registryUrl)}</div>
      </div>
      ${state?.error ? html`<p class="market-error">${state.error}</p>` : nothing}
      ${!project
        ? html`<p class="market-empty">打开含有 package.json.quajs.extension 声明的插件项目即可发布。</p>`
        : html`
        <div class="publisher-identity"><h3>${project.name}，${project.version}</h3><div class="market-badges">
          ${project.metadata?.runtime ? html`<span>Runtime</span>` : nothing}${project.metadata?.devtools ? html`<span>Devtools</span>` : nothing}
        </div></div>
        ${project.error ? html`<p class="market-error">${project.error}</p>` : nothing}
        <div class="publisher-steps">
          <section><h3>1. 验证发布权</h3><p>${submission ? '此包已登记，普通更新无需重复认领。维护者变化时可重新验证。' : '首次加入时，生成认领声明并保存到 package.json，随 npm 包一起发布。'}</p>
            <div class="market-actions">${this.button(submission ? '重新验证发布权' : '生成认领声明', async () => {
              const edit = await this.bridge.claimPlugin(this.project!.root)
              if (edit) {
                await this.applyEdit(edit)
                this.prepared = undefined
                this.message = '认领声明已写入 package.json 草稿。请保存后再打包。'
              }
              else {
                this.message = '此包已登记，无需重新认领。'
              }
            }, !state?.account || Boolean(project.error))}</div>
          </section>
          <section><h3>2. 检查并发布</h3><p>请先完成构建和 npm 登录。打包不执行生命周期脚本；发布使用本机 npm 凭据。</p>
            <div class="market-actions">${this.button('打包并检查文件', async () => {
              this.prepared = await this.bridge.preparePluginPublication(this.project!.root)
              this.message = '打包完成。检查下方文件清单后，可以发布此压缩包。'
            }, Boolean(project.error), true)}
            ${this.busy
              ? html`<button type="button" @click=${() => void this.bridge.cancelPluginPublication().catch((error) => {
                this.message = String(error)
                this.render()
              })}>取消操作</button>`
              : nothing}</div>
            ${artifact
              ? html`<div class="publisher-artifact"><strong>${artifact.name}@${artifact.version}</strong>
              <p>${artifact.fileCount} 个文件，${(artifact.bytes / 1024).toFixed(1)} KiB，${artifact.registry}</p><code>${artifact.integrity}</code>
              <details open><summary>发布文件${artifact.fileCount > artifact.files.length ? '（显示前 300 个）' : ''}</summary><pre>${artifact.files.join('\n')}</pre></details>
              <div class="market-actions">${this.otp}${this.button(`发布 ${artifact.version} 到 npm`, async () => {
                const otp = this.otp.value.trim()
                this.otp.value = ''
                await this.bridge.publishPlugin(this.project!.root, artifact.artifact, otp || undefined)
                this.prepared = undefined
                this.message = artifact.version.includes('-') ? '已发布到 npm 的 next 标签。Registry 同步 latest；稳定版设为 latest 后可加入。' : '已发布到 npm。首次发布请继续加入 Registry。'
              }, false, true)}</div>
            </div>`
              : nothing}
          </section>
          <section><h3>3. 加入 Registry</h3><p>系统从公开 npm 校验并审核 latest 版本。加入一次，后续版本自动同步。</p>
            <div class="market-actions">${this.button(submission ? '检查登记状态' : '提交已发布的包', async () => {
              const result = await this.bridge.submitPlugin(this.project!.root)
              this.message = `${statusText[result.status]}${result.reason ? `：${result.reason}` : ''}`
              if (this.state)
                this.state.submissions = [...this.state.submissions.filter(item => item.name !== result.name), result]
            }, !state?.account || Boolean(project.error))}</div>
            ${submission ? html`<p class="publisher-status">${statusText[submission.status]}，${submission.version}${submission.official ? '（官方）' : ''}</p><p>${submission.reason ?? ''}</p>` : nothing}
          </section>
        </div>`}
      <p class="publisher-message" role="status">${this.message}</p>
    `, this.host)
  }
}
