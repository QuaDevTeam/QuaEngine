// Installed exclusively in the disposable coverage build.
const documentId = crypto.randomUUID()
function snapshot(final) {
  const files = {}
  for (const [path, { s, f, b }] of Object.entries(globalThis.__coverage__ || {}))
    files[path] = { s, f, b }
  if (Object.keys(files).length)
    window.recordEditorCoverage(documentId, final, JSON.stringify(files))
}
const timer = setInterval(snapshot, 2000, false)
function finish() {
  clearInterval(timer)
  snapshot(true)
}
window.addEventListener('pagehide', finish, { once: true })
window.addEventListener('editor-e2e-coverage-finish', finish, { once: true })
