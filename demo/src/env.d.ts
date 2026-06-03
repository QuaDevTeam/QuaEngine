/// <reference types="vite/client" />

declare module '*.qs' {
  const createQuaScript: import('@quajs/engine').OptionalGameStepFactory
  export default createQuaScript
}

declare module '*.css'
declare module '*.scss'
