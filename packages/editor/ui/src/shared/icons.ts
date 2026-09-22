import { element } from '@quajs/editor-controls'
import { html, render } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'

const paths = {
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 8 4 4-4 4m6 0h4"/>',
  pulse: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  writer: '<path d="M5 4h10M5 9h6M5 14h4M5 20h14M13 15l6-10 3 2-6 10-4 2z"/>',
  character: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  keyframes: '<path d="M2 12h4m12 0h4m-10-7 7 7-7 7-7-7z"/>',
  extensions: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="m17 2 5 5-5 5-5-5z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  warning: '<path d="m12 3 10 18H2zM12 9v5m0 3v1"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  clear: '<path d="m14 3 7 7-11 11H6l-4-4zM9 10l7 7M10 21h12"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 7v10M18 7v3c0 4-12 1-12 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  files: '<path d="M8 3h8l4 4v14H8zM16 3v5h4M4 17V2h10"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  story: '<rect x="3" y="3" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M6 8v10h9M6 12h12V8"/><rect x="15" y="3" width="6" height="5" rx="1"/>',
  folder: '<path d="M3 6h7l2 2h9v12H3z"/>',
  folderOpen: '<path d="M3 11V6h7l2 2h8v3M2 11h20l-3 9H5z"/>',
  document: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/>',
  code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  tree: '<rect x="3" y="3" width="6" height="5" rx="1"/><rect x="15" y="10" width="6" height="5" rx="1"/><rect x="15" y="18" width="6" height="3" rx="1"/><path d="M6 8v11h9M6 12h9"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="8" cy="9" r="1.5"/><path d="m3 18 5-5 4 3 4-6 5 7"/>',
  audio: '<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/>',
  volume: '<path d="M11 4 6 8H3v8h3l5 4zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  muted: '<path d="M11 4 6 8H3v8h3l5 4zM16 9l6 6m0-6-6 6"/>',
  video: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="m10 8 6 4-6 4z"/>',
  font: '<path d="m4 20 7-17 7 17M7 13h8M15 20h6"/>',
  package: '<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10M8 4l9 5"/>',
  other: '<path d="M6 3h8l4 4v14H6zM14 3v5h4"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  collapse: '<path d="m7 8 5-5 5 5M7 16l5 5 5-5M4 12h16"/>',
  refresh: '<path d="M20 8a8 8 0 1 0 0 8M20 3v6h-6"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  step: '<path d="M4 8a8 8 0 0 1 16 0m-4-3 4 4 3-4M12 13v7m-4-4 4 4 4-4"/>',
  runToCursor: '<path d="m3 6 8 6-8 6zM15 4h6m-3 0v16m-3 0h6"/>',
  popout: '<path d="M13 3h8v8m0-8-10 10M9 5H3v16h16v-6"/>',
  redock: '<path d="M10 10h8m-8 0v8m0-8 11 11M17 6V3H3v14h3"/>',
  fullscreen: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M8 14h13"/>',
  list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1"/>',
  import: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  diff: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M12 9v6M9 18h6"/>',
  locate: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
} as const
export type IconName = keyof typeof paths
export function icon(name: IconName): string {
  return `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`
}
export function iconButton(name: IconName, label: string): HTMLButtonElement {
  const button = element<HTMLButtonElement>(html`<button type="button" class="icon-button"></button>`)
  setIconButton(button, name, label)
  return button
}
const iconHosts = new WeakSet<HTMLButtonElement>()
export function setIconButton(button: HTMLButtonElement, name: IconName, label: string): void {
  if (!iconHosts.has(button)) {
    button.replaceChildren()
    iconHosts.add(button)
  }
  render(unsafeHTML(icon(name)), button)
  button.title = label
  button.setAttribute('aria-label', label)
}
