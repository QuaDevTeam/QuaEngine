const storageMessages = new Set([
  'Novel Writer 数据目录正在打开，请稍后重试。',
  'Novel Writer 已在另一个编辑器窗口中运行，请先关闭该窗口。',
  'Novel Writer 数据目录当前不可用。',
])

/** Return diagnostic categories only, never raw exceptions containing project data or secrets. */
export function startupErrorMessage(error) {
  if (storageMessages.has(error?.message))
    return error.message
  if (error instanceof SyntaxError)
    return 'Novel Writer 加载失败（SyntaxError）：构建文件或本地数据存在语法错误。请先运行 pnpm --filter @quajs/editor-novel-writer build 后重试。'
  if (error?.code === 'ERR_MODULE_NOT_FOUND')
    return 'Novel Writer 缺少构建文件或运行依赖（ERR_MODULE_NOT_FOUND），请运行 pnpm dev:editor 重新构建并启动编辑器。'
  if (error?.code === 'EACCES' || error?.code === 'EPERM')
    return 'Novel Writer 无法访问所需文件，请检查写作数据目录和工作区的访问权限。'
  return 'Novel Writer 启动失败，请重试；若问题持续，请重新构建写作工作区。'
}
