/// <reference types="vite/client" />

declare module 'virtual:qua-project' {
  import type {
    NormalizedQuaProjectConfig,
    QuaProjectWebRuntimeConfig,
  } from '@quajs/quack/project'

  export const quaProject: NormalizedQuaProjectConfig
  export const quaWebRuntime: QuaProjectWebRuntimeConfig
  export default quaProject
}
