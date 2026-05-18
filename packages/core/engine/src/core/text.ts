import type { StepContext, TranslateInput } from './types'

export type QuaTextPart = unknown

export async function resolveQuaText(
  _ctx: Pick<StepContext, 't'>,
  parts: readonly QuaTextPart[],
): Promise<string> {
  const resolved = await Promise.all(parts.map(resolveQuaTextPart))
  return resolved.join('')
}

async function resolveQuaTextPart(part: QuaTextPart): Promise<string> {
  const value = await part
  if (value === undefined || value === null) {
    return ''
  }
  return String(value)
}

export type QuaTranslate = (key: string, options?: TranslateInput) => Promise<string>
