import type { ITheme } from '@xterm/xterm'
import { editorTheme } from './controller'

export function terminalTheme(): ITheme {
  const color = (name: string) => editorTheme.color(name)
  return {
    background: color('terminal-bg'),
    foreground: color('text'),
    cursor: color('accent'),
    cursorAccent: color('terminal-bg'),
    selectionBackground: color('selection'),
    selectionForeground: color('text'),
    black: color('ansi-black'),
    brightBlack: color('ansi-bright-black'),
    white: color('ansi-white'),
    brightWhite: color('ansi-bright-white'),
    red: color('danger'),
    brightRed: color('danger'),
    green: color('success'),
    brightGreen: color('success'),
    yellow: color('warning'),
    brightYellow: color('warning'),
    blue: color('info'),
    brightBlue: color('info'),
    magenta: color('purple'),
    brightMagenta: color('purple'),
    cyan: color('cyan'),
    brightCyan: color('cyan'),
  }
}
