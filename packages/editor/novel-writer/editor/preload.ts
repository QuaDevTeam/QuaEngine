import { contextBridge, ipcRenderer } from 'electron'

// Project-scoped authoring only; no filesystem, shell or generic host IPC.
contextBridge.exposeInMainWorld('quaNovelWriter', {
  context: () => ipcRenderer.invoke('novel-writer:context'),
  capture: () => ipcRenderer.invoke('novel-writer:capture'),
  convert: (prose: string) => ipcRenderer.invoke('novel-writer:convert', prose),
  validate: (request: unknown) => ipcRenderer.invoke('novel-writer:validate', request),
  apply: (request: unknown) => ipcRenderer.invoke('novel-writer:apply', request),
  onProjectChange: (listener: () => void) => {
    ipcRenderer.on('novel-writer:project-changed', listener)
    return () => ipcRenderer.removeListener('novel-writer:project-changed', listener)
  },
  dirty: (dirty: boolean) => ipcRenderer.send('novel-writer:dirty', dirty === true),
  onCommand: (listener: (command: string) => void) => {
    const handler = (_event: unknown, command: string): void => listener(command)
    ipcRenderer.on('novel-writer:command', handler)
    return () => ipcRenderer.removeListener('novel-writer:command', handler)
  },
})
