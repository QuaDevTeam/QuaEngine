import { preferences } from '../settings/store'

export type ColorMode = 'light' | 'dark'

/** Theme is profile-local presentation, shared by workbench and popout chrome. */
class EditorTheme {
  private readonly system = matchMedia('(prefers-color-scheme: dark)')
  private readonly listeners = new Set<() => void>()
  mode: ColorMode = 'light'
  private name = ''

  constructor() {
    this.apply()
    const unsubscribe = preferences.subscribe(() => this.apply())
    const systemChanged = () => this.apply()
    this.system.addEventListener('change', systemChanged)
    window.addEventListener('pagehide', () => {
      unsubscribe()
      this.system.removeEventListener('change', systemChanged)
      this.listeners.clear()
    }, { once: true })
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  color(token: string): string {
    const color = getComputedStyle(document.documentElement).getPropertyValue(`--editor-${token}`).trim()
    // Sass may shorten hex values; Monaco and alpha suffixes need full channels.
    return /^#[\da-f]{3,4}$/i.test(color)
      ? `#${[...color.slice(1)].map(channel => channel.repeat(2)).join('')}`
      : color
  }

  private apply(): void {
    const { colorMode, colorTheme } = preferences.value
    const mode = colorMode === 'system' ? this.system.matches ? 'dark' : 'light' : colorMode as ColorMode
    if (this.name === colorTheme && this.mode === mode)
      return
    this.name = colorTheme
    this.mode = mode
    document.documentElement.dataset.theme = mode
    document.documentElement.dataset.colorTheme = colorTheme
    for (const listener of this.listeners) listener()
  }
}

export const editorTheme = new EditorTheme()
