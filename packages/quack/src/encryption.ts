import { createLogger } from '@quajs/logger'
import type { EncryptionContext, EncryptionPlugin, EncryptionAlgorithm } from './types.js'

const logger = createLogger('quack:encryption')

// Environment variable for encryption key
const QUACK_ENCRYPTION_KEY = 'QUACK_ENCRYPTION_KEY'

export class EncryptionManager {
  private plugin?: EncryptionPlugin
  private key?: string
  private algorithm: EncryptionAlgorithm

  constructor(
    algorithm: EncryptionAlgorithm = 'none',
    key?: string,
    plugin?: EncryptionPlugin
  ) {
    this.algorithm = algorithm
    this.plugin = plugin
    this.key = this.resolveEncryptionKey(key)
  }

  /**
   * Resolve encryption key from environment or provided key
   */
  private resolveEncryptionKey(providedKey?: string): string | undefined {
    // Priority: provided key > environment variable
    if (providedKey) {
      return providedKey
    }

    const envKey = process.env[QUACK_ENCRYPTION_KEY]
    if (envKey) {
      logger.info('Using encryption key from environment variable')
      return envKey
    }

    return undefined
  }

  /**
   * Check if encryption is available and properly configured
   */
  isEncryptionAvailable(): boolean {
    if (this.algorithm === 'none') {
      return false
    }

    if (this.algorithm === 'custom') {
      return !!this.plugin
    }

    if (this.algorithm === 'xor') {
      return !!this.key
    }

    return false
  }

  /**
   * Encrypt buffer
   */
  async encrypt(buffer: Buffer, metadata: Record<string, any> = {}): Promise<Buffer> {
    if (!this.isEncryptionAvailable()) {
      logger.warn('Encryption requested but not properly configured - skipping encryption')
      return buffer
    }

    const context: EncryptionContext = {
      buffer,
      key: this.key!,
      metadata
    }

    try {
      if (this.algorithm === 'custom' && this.plugin) {
        logger.debug(`Encrypting with custom plugin: ${this.plugin.name}`)
        return await this.plugin.encrypt(context)
      }

      if (this.algorithm === 'xor' && this.key) {
        logger.debug('Encrypting with XOR algorithm')
        return this.xorEncrypt(buffer, this.key)
      }

      logger.warn(`Unsupported encryption algorithm: ${this.algorithm}`)
      return buffer
    } catch (error) {
      logger.error('Encryption failed:', error)
      throw new Error(`Encryption failed: ${error.message}`)
    }
  }

  /**
   * Decrypt buffer
   */
  async decrypt(buffer: Buffer, metadata: Record<string, any> = {}): Promise<Buffer> {
    if (!this.isEncryptionAvailable()) {
      logger.warn('Decryption requested but not properly configured - returning original buffer')
      return buffer
    }

    const context: EncryptionContext = {
      buffer,
      key: this.key!,
      metadata
    }

    try {
      if (this.algorithm === 'custom' && this.plugin) {
        logger.debug(`Decrypting with custom plugin: ${this.plugin.name}`)
        return await this.plugin.decrypt(context)
      }

      if (this.algorithm === 'xor' && this.key) {
        logger.debug('Decrypting with XOR algorithm')
        return this.xorDecrypt(buffer, this.key)
      }

      logger.warn(`Unsupported decryption algorithm: ${this.algorithm}`)
      return buffer
    } catch (error) {
      logger.error('Decryption failed:', error)
      throw new Error(`Decryption failed: ${error.message}`)
    }
  }

  /**
   * XOR encryption/decryption (symmetric)
   */
  private xorEncrypt(buffer: Buffer, key: string): Buffer {
    return this.xorOperation(buffer, key)
  }

  private xorDecrypt(buffer: Buffer, key: string): Buffer {
    return this.xorOperation(buffer, key)
  }

  /**
   * Perform XOR operation with key
   */
  private xorOperation(buffer: Buffer, key: string): Buffer {
    if (!key || key.length === 0) {
      throw new Error('XOR encryption key cannot be empty')
    }

    const keyBuffer = Buffer.from(key, 'utf8')
    const result = Buffer.alloc(buffer.length)

    for (let i = 0; i < buffer.length; i++) {
      result[i] = buffer[i] ^ keyBuffer[i % keyBuffer.length]
    }

    return result
  }

  /**
   * Get encryption info for manifest
   */
  getEncryptionInfo(): { enabled: boolean; algorithm: EncryptionAlgorithm } {
    return {
      enabled: this.isEncryptionAvailable(),
      algorithm: this.isEncryptionAvailable() ? this.algorithm : 'none'
    }
  }

  /**
   * Validate encryption configuration
   */
  validateConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (this.algorithm === 'none') {
      return { valid: true, errors: [] }
    }

    if (this.algorithm === 'xor') {
      if (!this.key) {
        errors.push(`XOR encryption requires a key. Set ${QUACK_ENCRYPTION_KEY} environment variable or provide key in config.`)
      } else if (this.key.length < 8) {
        errors.push('XOR encryption key should be at least 8 characters long for better security.')
      }
    }

    if (this.algorithm === 'custom') {
      if (!this.plugin) {
        errors.push('Custom encryption requires an encryption plugin.')
      } else {
        if (!this.plugin.name || !this.plugin.algorithm) {
          errors.push('Custom encryption plugin must have name and algorithm properties.')
        }
        if (typeof this.plugin.encrypt !== 'function' || typeof this.plugin.decrypt !== 'function') {
          errors.push('Custom encryption plugin must implement encrypt() and decrypt() methods.')
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Get environment variable name for encryption key
   */
  static getEncryptionKeyEnvVar(): string {
    return QUACK_ENCRYPTION_KEY
  }

  /**
   * Check if encryption key is available in environment
   */
  static hasEnvironmentKey(): boolean {
    return !!process.env[QUACK_ENCRYPTION_KEY]
  }

  /**
   * Log encryption configuration warnings
   */
  logConfigurationWarnings(): void {
    const validation = this.validateConfiguration()
    
    if (!validation.valid) {
      logger.warn('Encryption configuration issues:')
      for (const error of validation.errors) {
        logger.warn(`  - ${error}`)
      }
    }

    if (this.algorithm === 'xor' && !EncryptionManager.hasEnvironmentKey() && this.key) {
      logger.warn('Using hardcoded encryption key. Consider using environment variable for better security.')
    }

    if (this.algorithm !== 'none' && !this.isEncryptionAvailable()) {
      logger.warn('Encryption requested but will be skipped due to configuration issues.')
    }
  }
}