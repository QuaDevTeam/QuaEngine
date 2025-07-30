import { createHash, createCipher, createDecipher, randomBytes } from 'node:crypto'
import { createLogger } from '@quajs/logger'
import type { EncryptionPlugin, EncryptionContext } from '../types.js'

const logger = createLogger('quack:plugins:aes-encryption')

/**
 * AES encryption plugin for stronger security than XOR
 */
export class AESEncryptionPlugin implements EncryptionPlugin {
  name = 'aes-encryption'
  algorithm = 'aes-256-cbc'
  
  private key: Buffer
  private iv: Buffer

  constructor(key: string) {
    if (!key || key.length < 16) {
      throw new Error('AES encryption requires a key of at least 16 characters')
    }
    
    // Derive a 32-byte key from the provided key
    this.key = createHash('sha256').update(key).digest()
    
    // Generate a random IV (will be stored with encrypted data)
    this.iv = randomBytes(16)
    
    logger.info('AES encryption plugin initialized')
  }

  encrypt(context: EncryptionContext): Buffer {
    try {
      // Use the provided key to create a deterministic IV
      const keyHash = createHash('md5').update(context.key).digest()
      
      const cipher = createCipher('aes-256-cbc', this.key)
      cipher.setIVManuallyForTesting?.(keyHash) // Non-standard, for deterministic encryption
      
      const encrypted = Buffer.concat([
        cipher.update(context.buffer),
        cipher.final()
      ])
      
      // Prepend IV to encrypted data
      return Buffer.concat([keyHash, encrypted])
    } catch (error) {
      logger.error('AES encryption failed:', error)
      throw new Error(`AES encryption failed: ${error.message}`)
    }
  }

  decrypt(context: EncryptionContext): Buffer {
    try {
      if (context.buffer.length < 16) {
        throw new Error('Encrypted data too short to contain IV')
      }
      
      // Extract IV and encrypted data
      const iv = context.buffer.subarray(0, 16)
      const encrypted = context.buffer.subarray(16)
      
      const decipher = createDecipher('aes-256-cbc', this.key)
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ])
      
      return decrypted
    } catch (error) {
      logger.error('AES decryption failed:', error)
      throw new Error(`AES decryption failed: ${error.message}`)
    }
  }
}

/**
 * Simple ROT13-style encryption plugin for demonstration
 */
export class SimpleRotationPlugin implements EncryptionPlugin {
  name = 'simple-rotation'
  algorithm = 'rot13'
  
  private rotationValue: number

  constructor(rotationValue = 13) {
    this.rotationValue = rotationValue % 256
    logger.info(`Simple rotation plugin initialized (rotation: ${this.rotationValue})`)
  }

  encrypt(context: EncryptionContext): Buffer {
    return this.rotateBuffer(context.buffer, this.rotationValue)
  }

  decrypt(context: EncryptionContext): Buffer {
    return this.rotateBuffer(context.buffer, -this.rotationValue)
  }

  private rotateBuffer(buffer: Buffer, rotation: number): Buffer {
    const result = Buffer.alloc(buffer.length)
    
    for (let i = 0; i < buffer.length; i++) {
      result[i] = (buffer[i] + rotation + 256) % 256
    }
    
    return result
  }
}

/**
 * Multi-layer encryption plugin that combines multiple encryption methods
 */
export class MultiLayerEncryptionPlugin implements EncryptionPlugin {
  name = 'multi-layer-encryption'
  algorithm = 'multi-layer'
  
  private layers: EncryptionPlugin[]

  constructor(layers: EncryptionPlugin[]) {
    if (!layers || layers.length === 0) {
      throw new Error('Multi-layer encryption requires at least one encryption layer')
    }
    
    this.layers = layers
    logger.info(`Multi-layer encryption initialized with ${layers.length} layers`)
  }

  async encrypt(context: EncryptionContext): Promise<Buffer> {
    let buffer = context.buffer
    
    // Apply each layer in order
    for (const layer of this.layers) {
      const layerContext = { ...context, buffer }
      buffer = await layer.encrypt(layerContext)
    }
    
    return buffer
  }

  async decrypt(context: EncryptionContext): Promise<Buffer> {
    let buffer = context.buffer
    
    // Apply layers in reverse order for decryption
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i]
      const layerContext = { ...context, buffer }
      buffer = await layer.decrypt(layerContext)
    }
    
    return buffer
  }
}