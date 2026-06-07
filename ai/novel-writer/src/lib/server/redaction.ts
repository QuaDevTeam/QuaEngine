const secretPatterns = [
  /sk-[a-zA-Z0-9_-]{12,}/g,
  /tvly-[a-zA-Z0-9_-]{12,}/g,
  /Bearer\s+[a-zA-Z0-9._-]+/g,
]

export function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') {
    return secretPatterns.reduce((text, pattern) => text.replace(pattern, '[redacted]'), value)
  }

  if (Array.isArray(value)) {
    return value.map(item => redactSecrets(item))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key.toLowerCase().includes('apikey') || key.toLowerCase().includes('api_key')
          ? '[redacted]'
          : redactSecrets(item),
      ]),
    )
  }

  return value
}
