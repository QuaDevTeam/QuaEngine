/** Linear matching over compiler-owned step spans; no editor-only QS grammar. */
export function resolveReloadStep(before: string[], after: string[], index: number): { index: number, reset: boolean } {
  if (index < 0 || index >= before.length || !after.length)
    return { index: 0, reset: true }
  let head = 0
  while (head < before.length && head < after.length && before[head] === after[head]) head++
  let tail = 0
  while (tail < before.length - head && tail < after.length - head && before[before.length - tail - 1] === after[after.length - tail - 1]) tail++
  if (index < head)
    return { index, reset: false }
  if (index >= before.length - tail)
    return { index: after.length - (before.length - index), reset: false }
  if (before.length - head - tail === after.length - head - tail)
    return { index, reset: false }
  return { index: 0, reset: true }
}
