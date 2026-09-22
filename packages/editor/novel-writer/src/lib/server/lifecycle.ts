/** Service shutdown only; workflow and checkpoints still belong to the writing runtime. */
const shutdown = new AbortController()
export const serviceSignal = shutdown.signal
export function stopService(): void {
  shutdown.abort(new Error('写作服务已关闭；可以从已保存的检查点继续。'))
}
