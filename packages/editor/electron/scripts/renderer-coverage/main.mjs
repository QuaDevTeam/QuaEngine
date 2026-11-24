// Test-only main entry. Accept snapshots solely from our bundled HTML pages.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ipcMain } from 'electron'

const pages = new Set(['index', 'preview', 'asset'].map(name => new URL(`./dist/ui/${name}.html`, import.meta.url).href))
ipcMain.on('editor-test:coverage', (event, id, final, hits) => {
  if (!pages.has(event.senderFrame?.url?.split(/[?#]/u)[0]) || !/^[a-f0-9-]{36}$/u.test(id) || typeof hits !== 'string') {
    event.returnValue = false
    return
  }
  const snapshot = { final, files: JSON.parse(hits) }
  writeFileSync(join(process.env.QUA_EDITOR_E2E_SNAPSHOTS, `${id}.json`), JSON.stringify(snapshot))
  event.returnValue = true
})

await import('./dist/main.js')
