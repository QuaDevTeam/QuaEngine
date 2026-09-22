import { unlinkSync } from 'node:fs'
/* eslint-disable style/max-statements-per-line */
import { mkdir, open, readFile, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** Never recover checkpoints belonging to another live editor service. */
export async function lockStorage() {
  const home = resolve(process.env.NOVEL_WRITER_HOME || join(homedir(), '.quaengine', 'novel-writer'))
  await mkdir(home, { recursive: true })
  const path = join(home, 'editor-service.lock')
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(path, 'wx', 0o600)
      await file.writeFile(String(process.pid))
      await file.close()
      process.once('exit', () => {
        try { unlinkSync(path) }
        catch { /* Abrupt termination is recovered on next launch. */ }
      })
      return
    }
    catch (error) {
      if (error.code !== 'EEXIST')
        throw error
      const pid = Number(await readFile(path, 'utf8'))
      if (!Number.isSafeInteger(pid) || pid <= 0)
        throw new Error('Novel Writer 数据目录正在打开，请稍后重试。')
      try {
        process.kill(pid, 0)
      }
      catch (probe) {
        if (probe.code === 'ESRCH') {
          await unlink(path)
          continue
        }
        throw probe
      }
      throw new Error('Novel Writer 已在另一个编辑器窗口中运行，请先关闭该窗口。')
    }
  }
  throw new Error('Novel Writer 数据目录当前不可用。')
}
