import type { EditorBridge, EditorTerminalEvent, EditorTerminalSession } from '@quajs/editor-core'
import { button, element } from '@quajs/editor-controls'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { html, render } from 'lit'
import { workbenchEmpty } from '../../shared/empty-state'
import { iconButton } from '../../shared/icons'
import { preferences } from '../settings/store'
import { editorTheme } from '../theme/controller'
import { terminalTheme } from '../theme/terminal'
import '@xterm/xterm/css/xterm.css'
import './styles.scss'

interface Session {
  info: EditorTerminalSession
  terminal: Terminal
  fit: FitAddon
  host: HTMLElement
  option: HTMLOptionElement
  tab: HTMLButtonElement
  input: string
  writing: boolean
  exited: boolean
}

export class TerminalPanel {
  private readonly sessions = new Map<string, Session>()
  private readonly select = element<HTMLSelectElement>(html`<select></select>`)
  private readonly tabs = element<HTMLDivElement>(html`<div></div>`)
  private readonly viewport = element<HTMLDivElement>(html`<div></div>`)
  private readonly retry = button('新建终端', () => {
    void this.create()
  })

  private readonly empty = workbenchEmpty('terminal', '没有运行中的终端', '在这里运行命令、构建和管理项目。', [this.retry])
  private readonly cwd = element<HTMLSpanElement>(html`<span></span>`)
  private readonly add = iconButton('plus', '新建终端（Ctrl+Shift+`）')
  private readonly remove = iconButton('trash', '终止终端及其子进程')
  private readonly clear = iconButton('clear', '清空终端显示')
  private root = ''
  private active?: Session
  private visible = false
  private creating = false
  private generation = 0
  private failure = ''
  private nextSession = 1
  private resizeTimer?: ReturnType<typeof setTimeout>

  constructor(host: HTMLElement, private readonly bridge: EditorBridge, private readonly error: (error: unknown) => void) {
    this.select.id = 'terminal-sessions'
    this.select.setAttribute('aria-label', '终端会话')
    this.select.tabIndex = -1
    this.select.onchange = () => this.activate(this.select.value)
    this.tabs.className = 'terminal-tabs'
    this.tabs.setAttribute('role', 'tablist')
    this.tabs.setAttribute('aria-label', '终端会话')
    this.tabs.setAttribute('aria-orientation', 'vertical')
    this.tabs.addEventListener('keydown', (event) => {
      const tabs = [...this.tabs.querySelectorAll<HTMLButtonElement>('.terminal-tab')]
      const index = tabs.indexOf(document.activeElement as HTMLButtonElement)
      if (index < 0 || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))
        return
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowDown' ? (index + 1) % tabs.length : (index + tabs.length - 1) % tabs.length
      const session = [...this.sessions.values()][next]
      if (session)
        this.activate(session.info.id, false)
      tabs[next]?.focus()
    })
    this.cwd.className = 'terminal-cwd'
    this.viewport.className = 'terminal-viewport'
    this.empty.element.classList.add('terminal-empty')
    this.add.id = 'terminal-new'
    this.remove.id = 'terminal-kill'
    this.clear.id = 'terminal-clear'
    this.add.onclick = () => {
      void this.create()
    }
    this.remove.onclick = () => {
      void this.close()
    }
    this.clear.onclick = () => {
      this.active?.terminal.clear()
      this.focus()
    }
    render(html`<div class="terminal-toolbar">${this.select}${this.cwd}
      <div class="terminal-toolbar-actions">${this.add}${this.clear}${this.remove}</div></div>
      <div class="terminal-body">${this.viewport}${this.tabs}${this.empty.element}</div>`, host)
    bridge.onTerminalEvent(event => this.event(event))
    host.addEventListener('focusin', () => {
      void bridge.focusTerminal(true).catch(error)
    })
    host.addEventListener('focusout', () => {
      queueMicrotask(() => {
        void bridge.focusTerminal(host.contains(document.activeElement)).catch(error)
      })
    })
    // A single observer and debounce, independent of output throughput/session count.
    new ResizeObserver(() => this.scheduleFit()).observe(this.viewport)
    document.addEventListener('visibilitychange', () => this.scheduleFit())
    const unsubscribe = preferences.subscribe(() => {
      for (const session of this.sessions.values()) {
        session.terminal.options.fontSize = preferences.value.terminalFontSize
        session.terminal.options.scrollback = preferences.value.terminalScrollback
        session.terminal.options.cursorBlink = preferences.value.terminalCursorBlink && !preferences.value.reducedMotion
      }
      this.scheduleFit()
    })
    const unsubscribeTheme = editorTheme.subscribe(() => {
      for (const session of this.sessions.values())
        session.terminal.options.theme = terminalTheme()
    })
    window.addEventListener('pagehide', unsubscribeTheme, { once: true })
    window.addEventListener('beforeunload', unsubscribe, { once: true })
    this.renderState()
  }

  setRoot(root: string): void {
    if (root === this.root)
      return
    this.root = root
    ++this.generation
    this.failure = ''
    this.nextSession = 1
    for (const session of this.sessions.values())
      session.terminal.dispose()
    this.sessions.clear()
    this.active = undefined
    this.viewport.replaceChildren()
    this.renderState()
    if (this.visible)
      void this.open()
  }

  setVisible(visible: boolean): void {
    const entering = visible && !this.visible
    this.visible = visible
    clearTimeout(this.resizeTimer)
    if (visible) {
      this.scheduleFit()
      if (entering)
        void this.open()
    }
    else {
      void this.bridge.focusTerminal(false).catch(this.error)
    }
  }

  focus(): void {
    if (this.visible && !document.querySelector('dialog[open]'))
      this.active?.terminal.focus()
  }

  async open(fresh = false): Promise<void> {
    if (fresh || !this.active)
      await this.create()
    else this.focus()
  }

  private async create(): Promise<void> {
    if (this.creating || this.sessions.size >= 6)
      return
    this.creating = true
    this.failure = ''
    this.renderState()
    const root = this.root
    const generation = this.generation
    let info: EditorTerminalSession | undefined
    try {
      info = await this.bridge.createTerminal(root, 80, 24)
      if (generation !== this.generation) {
        await this.bridge.closeTerminal(info.id)
        return
      }
      const terminal = new Terminal({
        cols: 80,
        rows: 24,
        scrollback: preferences.value.terminalScrollback,
        fontSize: preferences.value.terminalFontSize,
        lineHeight: 1.2,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        cursorBlink: preferences.value.terminalCursorBlink && !preferences.value.reducedMotion,
        cursorStyle: 'bar',
        allowProposedApi: false,
        theme: terminalTheme(),
      })
      const fit = new FitAddon()
      terminal.loadAddon(fit)
      const host = element<HTMLDivElement>(html`<div></div>`)
      host.className = 'terminal-instance'
      host.dataset.sessionId = info.id
      host.id = `terminal-panel-${info.id}`
      host.setAttribute('role', 'tabpanel')
      host.setAttribute('aria-labelledby', `terminal-tab-${info.id}`)
      this.viewport.append(host)
      terminal.open(host)
      const label = `${this.nextSession++}: ${info.shell}`
      const option = element<HTMLOptionElement>(html`<option value=${info.id}>${label}</option>`)
      const tab = element<HTMLButtonElement>(html`<button type="button" class="terminal-tab" role="tab" id=${`terminal-tab-${info.id}`}
        aria-controls=${host.id} title=${info.root} @click=${() => this.activate(info!.id)}>
        <span class="terminal-tab-icon">›_</span><span class="terminal-tab-label">${label}</span></button>`)
      const session: Session = { info, terminal, fit, host, option, tab, input: '', writing: false, exited: false }
      this.sessions.set(info.id, session)
      terminal.onData(data => this.input(session, data))
      // No web-link/OSC clipboard addons: output cannot open URLs or write clipboard.
      terminal.attachCustomKeyEventHandler((event) => {
        const mac = navigator.platform.toLowerCase().includes('mac')
        const clipboard = mac ? event.metaKey : event.ctrlKey && event.shiftKey
        if (clipboard && ['c', 'v'].includes(event.key.toLowerCase())) {
          if (event.type === 'keydown') {
            event.preventDefault()
            if (event.key.toLowerCase() === 'c')
              void navigator.clipboard.writeText(terminal.getSelection()).catch(this.error)
            else void navigator.clipboard.readText().then(text => terminal.paste(text)).catch(this.error)
          }
          return false
        }
        return !(event.ctrlKey && event.code === 'Backquote')
      })
      this.activate(info.id)
      await this.bridge.acknowledgeTerminal(info.id, 0)
    }
    catch (error) {
      if (info)
        void this.bridge.closeTerminal(info.id).catch(() => {})
      if (generation === this.generation) {
        this.error(error)
        this.failure = error instanceof Error ? error.message : String(error)
      }
    }
    finally {
      this.creating = false
      this.renderState()
      if (generation !== this.generation && this.visible && !this.active)
        void this.open()
    }
  }

  private input(session: Session, data: string): void {
    if (session.exited || !this.sessions.has(session.info.id))
      return
    if (session.input.length + data.length > 1024 * 1024) {
      this.error(new Error('粘贴内容过长，请将内容保存为文件后在终端中读取。'))
      return
    }
    session.input += data
    if (session.writing)
      return
    session.writing = true
    void (async () => {
      while (session.input && this.sessions.has(session.info.id) && !session.exited) {
        let end = Math.min(16384, session.input.length)
        if (end < session.input.length && /[\uD800-\uDBFF]/u.test(session.input[end - 1]))
          end--
        const chunk = session.input.slice(0, end)
        session.input = session.input.slice(chunk.length)
        await this.bridge.writeTerminal(session.info.id, chunk)
      }
    })().catch(this.error).finally(() => {
      session.writing = false
    })
  }

  private event(event: EditorTerminalEvent): void {
    if (event.type === 'error') {
      this.error(event.message)
      for (const session of this.sessions.values())
        this.exit(session, -1)
      return
    }
    const session = this.sessions.get(event.id)
    if (!session)
      return
    if (event.type === 'data') {
      // Ack after parsing, not receipt: this bounds xterm AND IPC queues. Hidden
      // xterms keep their screen buffers current; xterm pauses offscreen rendering.
      session.terminal.write(event.data, () => {
        void this.bridge.acknowledgeTerminal(event.id, event.sequence).catch(this.error)
      })
    }
    else if (event.type === 'exit') {
      this.exit(session, event.code)
    }
    else {
      session.terminal.dispose()
      session.host.remove()
      this.sessions.delete(event.id)
      if (this.active === session) {
        this.active = undefined
        const next = this.sessions.keys().next().value
        if (next)
          this.activate(next)
      }
      this.renderState()
    }
  }

  private exit(session: Session, code: number): void {
    if (session.exited)
      return
    session.exited = true
    session.input = ''
    session.terminal.options.disableStdin = true
    session.terminal.writeln(`\r\n\x1B[90m进程已退出，代码 ${code}。\x1B[0m`)
    session.option.textContent += `（已退出，代码 ${code}）`
    session.tab.classList.add('is-exited')
    session.tab.querySelector('.terminal-tab-label')!.textContent = session.option.textContent
    this.renderState()
  }

  private activate(id: string, focus = true): void {
    this.active = this.sessions.get(id)
    this.select.value = id
    for (const session of this.sessions.values()) {
      session.host.hidden = session !== this.active
      session.tab.setAttribute('aria-selected', String(session === this.active))
      session.tab.tabIndex = session === this.active ? 0 : -1
    }
    this.renderState()
    this.scheduleFit()
    if (focus)
      this.focus()
  }

  private async close(): Promise<void> {
    if (!this.active)
      return
    this.remove.disabled = true
    const id = this.active.info.id
    try {
      await this.bridge.closeTerminal(id)
      this.event({ type: 'closed', id })
    }
    catch (error) {
      this.error(error)
    }
    finally {
      this.renderState()
    }
  }

  private renderState(): void {
    render(html`${[...this.sessions.values()].map(session => session.option)}`, this.select)
    render(html`${[...this.sessions.values()].map(session => session.tab)}`, this.tabs)
    this.select.value = this.active?.info.id ?? ''
    this.add.disabled = this.creating || this.sessions.size >= 6
    this.select.disabled = !this.sessions.size
    this.remove.disabled = !this.active
    this.clear.disabled = !this.active
    this.tabs.hidden = !this.sessions.size
    this.empty.element.hidden = Boolean(this.active)
    this.empty.heading.textContent = this.creating ? '正在启动终端…' : this.failure ? '终端启动失败' : '没有运行中的终端'
    this.empty.detail.textContent = this.failure || (this.creating ? '正在连接默认 Shell。' : '在这里运行命令、构建和管理项目。')
    this.retry.textContent = this.failure ? '重试' : '新建终端'
    this.retry.hidden = this.creating
    this.cwd.textContent = this.active ? this.active.info.root : ''
    this.cwd.title = this.active ? `初始目录：${this.active.info.root}` : ''
  }

  private scheduleFit(): void {
    clearTimeout(this.resizeTimer)
    if (!this.visible || document.hidden)
      return
    this.resizeTimer = setTimeout(() => {
      const session = this.active
      if (!session || !this.visible || document.hidden)
        return
      const size = session.fit.proposeDimensions()
      if (!size)
        return
      const cols = Math.max(2, Math.min(300, size.cols))
      const rows = Math.max(1, Math.min(120, size.rows))
      if (cols === session.terminal.cols && rows === session.terminal.rows)
        return
      session.terminal.resize(cols, rows)
      if (!session.exited)
        void this.bridge.resizeTerminal(session.info.id, cols, rows).catch(this.error)
    }, 80)
  }
}
