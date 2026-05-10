declare module '*.qs' {
  const createQuaScript: (scope?: Record<string, unknown>) => import('@quajs/engine').GameStep[]
  export default createQuaScript
}
