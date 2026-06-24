import type { RendererTargetCapability } from './capabilities'

export type NativeCapabilityManifestSha256 = (payload: string) => string

export function createNativeCapabilityManifestPayload(
  capabilities: readonly RendererTargetCapability[],
): string {
  const capabilityPayloads = capabilities.map(capability => [
    '{',
    jsonField('id', capability.id, true),
    jsonField('target', capability.target),
    jsonField('version', capability.version),
    jsonField('ownerPackage', capability.ownerPackage),
    jsonArrayField('projectionKeys', capability.projectionKeys),
    jsonArrayField('intentEvents', capability.intentEvents || []),
    jsonArrayField('assetKinds', capability.assetKinds || []),
    jsonArrayField('qssFeatures', capability.qssFeatures || []),
    jsonArrayField('quiComponents', capability.quiComponents || []),
    jsonField('fallback', capability.fallback),
    '}',
  ].join(''))

  return `[${capabilityPayloads.join(',')}]`
}

export function createNativeCapabilityManifestHash(
  capabilities: readonly RendererTargetCapability[],
  sha256: NativeCapabilityManifestSha256,
): string {
  const digest = sha256(createNativeCapabilityManifestPayload(capabilities))
  return digest.startsWith('sha256:') ? digest : `sha256:${digest}`
}

function jsonField(key: string, value: string, first = false): string {
  return `${first ? '' : ','}${jsonString(key)}:${jsonString(value)}`
}

function jsonArrayField(key: string, values: readonly string[]): string {
  return `,${jsonString(key)}:[${values.map(jsonString).join(',')}]`
}

function jsonString(value: string): string {
  let output = '"'
  for (const char of value) {
    switch (char) {
      case '"':
        output += '\\"'
        break
      case '\\':
        output += '\\\\'
        break
      case '\n':
        output += '\\n'
        break
      case '\r':
        output += '\\r'
        break
      case '\t':
        output += '\\t'
        break
      default: {
        const codePoint = char.codePointAt(0)!
        output += codePoint <= 0x1F
          ? `\\u${codePoint.toString(16).padStart(4, '0')}`
          : char
      }
    }
  }
  return `${output}"`
}
