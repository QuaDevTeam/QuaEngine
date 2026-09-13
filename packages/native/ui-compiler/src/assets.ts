import { isForbiddenNativeAssetReference, isForbiddenNativePayload } from '@quajs/native-contracts'

export function isSafeNativeAssetType(value: string): boolean {
  return /^[a-z][a-z0-9-]*$/i.test(value)
}

export function isSafePackageAssetName(value: string): boolean {
  return !isForbiddenNativeAssetReference(value)
    && !isForbiddenNativePayload(value)
}

export function literalStringValue(value: string | undefined): string | undefined {
  if (!value || value.length < 2)
    return undefined

  const quote = value[0]
  if ((quote !== '"' && quote !== '\'') || value[value.length - 1] !== quote)
    return undefined

  return value.slice(1, -1).trim()
}
