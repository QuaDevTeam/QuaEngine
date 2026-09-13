export function rangeOf(source: string, token: string) {
  const offset = source.indexOf(token)
  const start = positionAtOffset(source, offset)
  const end = positionAtOffset(source, offset + token.length)
  return { start, end }
}

export function positionAtOffset(source: string, offset: number) {
  const lines = source.slice(0, Math.max(0, offset)).split(/\r?\n/)
  return {
    character: lines[lines.length - 1].length,
    line: lines.length - 1,
  }
}
