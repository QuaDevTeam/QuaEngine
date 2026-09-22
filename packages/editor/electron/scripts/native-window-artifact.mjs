import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

/**
 * Finite OS-window acceptance artifact, never used by the preview runtime.
 * Chromium capturePage/page.screenshot omit sibling AppKit views.
 */
export async function captureNativeWindow(application, page, path) {
  if (process.platform !== 'darwin')
    throw new Error('Native view acceptance is currently implemented for macOS only.')
  const handle = await application.browserWindow(page)
  const id = await handle.evaluate((window) => {
    window.show()
    window.focus()
    return window.getMediaSourceId().split(':')[1]
  })
  await page.waitForTimeout(200)
  await promisify(execFile)('/usr/sbin/screencapture', ['-x', '-o', '-l', id, path])
}
