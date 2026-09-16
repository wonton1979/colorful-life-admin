import { contextBridge } from 'electron'

// Keep the preload as the only future boundary for renderer-to-main IPC.
contextBridge.exposeInMainWorld('electron', Object.freeze({}))
