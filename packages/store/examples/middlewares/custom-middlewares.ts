import type { StorageMiddleware } from '../../src/types/storage'
import { Buffer } from 'node:buffer'

/**
 * Encryption middleware example using a simple XOR cipher
 * NOTE: This is just an example - use proper encryption for production!
 */
export class EncryptionMiddleware implements StorageMiddleware {
  private key: string

  constructor(key: string = 'default-key') {
    this.key = key
  }

  private xorEncryptDecrypt(text: string, key: string): string {
    let result = ''
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length))
    }
    return result
  }

  async beforeWrite(key: string, value: any): Promise<any> {
    const jsonString = JSON.stringify(value)
    const encrypted = this.xorEncryptDecrypt(jsonString, this.key)
    return {
      ...value,
      data: Buffer.from(encrypted).toString('base64'),
      _encrypted: true,
    }
  }

  async afterRead(key: string, value: any): Promise<any> {
    if (value && value._encrypted) {
      const encrypted = Buffer.from(value.data, 'base64').toString()
      const decrypted = this.xorEncryptDecrypt(encrypted, this.key)
      const originalValue = JSON.parse(decrypted)
      return originalValue
    }
    return value
  }
}

/**
 * Compression middleware using JSON stringification compression
 */
export class CompressionMiddleware implements StorageMiddleware {
  async beforeWrite(key: string, value: any): Promise<any> {
    // Simple compression by removing whitespace from JSON
    const jsonString = JSON.stringify(value)
    const compressed = jsonString.replace(/\s+/g, '')

    return {
      ...value,
      data: compressed,
      _compressed: true,
      _originalSize: jsonString.length,
      _compressedSize: compressed.length,
    }
  }

  async afterRead(key: string, value: any): Promise<any> {
    if (value && value._compressed) {
      return JSON.parse(value.data)
    }
    return value
  }
}

/**
 * Logging middleware for debugging storage operations
 */
export class LoggingMiddleware implements StorageMiddleware {
  private logger: (message: string, ...args: any[]) => void

  constructor(logger?: (message: string, ...args: any[]) => void) {
    this.logger = logger || console.log
  }

  async beforeWrite(key: string, value: any): Promise<any> {
    this.logger(`[StorageMiddleware] Writing to key: ${key}`, { value })
    return value
  }

  async afterRead(key: string, value: any): Promise<any> {
    this.logger(`[StorageMiddleware] Reading from key: ${key}`, { value })
    return value
  }
}

/**
 * Validation middleware to ensure data integrity
 */
export class ValidationMiddleware implements StorageMiddleware {
  private validator: (value: any) => boolean

  constructor(validator: (value: any) => boolean) {
    this.validator = validator
  }

  async beforeWrite(key: string, value: any): Promise<any> {
    if (!this.validator(value)) {
      throw new Error(`Validation failed for key: ${key}`)
    }
    return value
  }

  async afterRead(key: string, value: any): Promise<any> {
    if (value && !this.validator(value)) {
      throw new Error(`Validation failed when reading key: ${key}`)
    }
    return value
  }
}
