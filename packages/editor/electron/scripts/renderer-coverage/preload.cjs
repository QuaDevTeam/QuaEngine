// Appended only to the copied sandbox preload in the test application.
require('electron').contextBridge.exposeInMainWorld('recordEditorCoverage', (id, final, hits) =>
  require('electron').ipcRenderer.sendSync('editor-test:coverage', id, final, hits))
