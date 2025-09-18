// Example WebSocket Plugin demonstrating network event transport
import { Plugin, type Pipeline, type EventListener, type PluginEmitHook, type PluginOnHook, type PluginOffHook } from '../src/index.js'
import { getPackageLogger } from '@quajs/logger'

const logger = getPackageLogger('pipeline').module('websocket-plugin')

export class WebSocketPlugin extends Plugin {
  readonly name = 'websocket-transport'
  
  private ws?: WebSocket
  private url: string
  private listeners = new Map<string, Set<EventListener>>()
  private connected = false

  constructor(url: string) {
    super()
    this.url = url
  }

  async setup(pipeline: Pipeline): Promise<void> {
    // Initialize WebSocket connection
    await this.connect()
    
    // Set up hooks to take over emit/on/off
    this.setEmitHook(this.handleEmit.bind(this))
    this.setOnHook(this.handleOn.bind(this))
    this.setOffHook(this.handleOff.bind(this))
  }

  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)
        
        this.ws.onopen = () => {
          logger.info(`Connected to ${this.url}`)
          this.connected = true
          resolve()
        }
        
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data as string)
            if (data.type && data.payload !== undefined) {
              this.handleIncomingEvent(data.type, data.payload)
            }
          } catch (error) {
            logger.error('Failed to parse incoming message:', error)
          }
        }
        
        this.ws.onclose = () => {
          logger.info('Connection closed')
          this.connected = false
        }
        
        this.ws.onerror = (error) => {
          logger.error('WebSocket error:', error)
          reject(error)
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  private handleIncomingEvent(type: string, payload: unknown): void {
    const specificListeners = this.listeners.get(type)
    const wildcardListeners = this.listeners.get('*')
    
    const context = {
      event: {
        type,
        payload,
        timestamp: Date.now(),
        id: `ws-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
      },
      handled: false,
      stopPropagation: false
    }

    // Notify specific listeners
    if (specificListeners) {
      specificListeners.forEach(listener => {
        try {
          void listener(context)
        } catch (error) {
          logger.error('Error in listener:', error)
        }
      })
    }

    // Notify wildcard listeners
    if (wildcardListeners) {
      wildcardListeners.forEach(listener => {
        try {
          void listener(context)
        } catch (error) {
          logger.error('Error in wildcard listener:', error)
        }
      })
    }
  }

  // Override emit to send events through WebSocket
  private handleEmit: PluginEmitHook = async (type, payload, originalEmit) => {
    if (!this.connected || !this.ws) {
      logger.warn('Not connected, falling back to local emit')
      await originalEmit(type, payload)
      return
    }

    try {
      const message = JSON.stringify({ type, payload })
      this.ws.send(message)
      logger.debug(`Sent event: ${type}`)
    } catch (error) {
      logger.error('Failed to send event:', error)
      // Fallback to local emit
      await originalEmit(type, payload)
    }
  }

  // Override on to register listeners for network events
  private handleOn: PluginOnHook = (type, listener, originalOn) => {
    // Store listener for network events
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(listener)
    
    // Also register with local pipeline for fallback
    return originalOn(type, listener)
  }

  // Override off to remove listeners
  private handleOff: PluginOffHook = (type, listener, originalOff) => {
    // Remove from network listeners
    const listeners = this.listeners.get(type)
    if (listeners) {
      listeners.delete(listener)
      if (listeners.size === 0) {
        this.listeners.delete(type)
      }
    }
    
    // Also remove from local pipeline
    return originalOff(type, listener)
  }

  // Utility methods
  isConnected(): boolean {
    return this.connected
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = undefined
    }
    this.connected = false
  }

  reconnect(): Promise<void> {
    this.disconnect()
    return this.connect()
  }
}

// Example usage:
/*
import { Pipeline } from '@quajs/pipeline'
import { WebSocketPlugin } from './websocket-plugin'

const pipeline = new Pipeline({
  plugins: [
    new WebSocketPlugin('ws://localhost:8080/events')
  ]
})

// Now all emit calls will send events through WebSocket
await pipeline.emit('game:action', { action: 'move', direction: 'up' })

// And all on calls will listen for events from WebSocket
pipeline.on('game:state', (context) => {
  // eslint-disable-next-line no-console
  console.log('Received game state:', context.event.payload)
})
*/