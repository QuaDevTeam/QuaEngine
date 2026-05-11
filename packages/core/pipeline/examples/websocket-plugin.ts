import type { PipelineContext, PipelineTransport, PipelineTransportContext } from '../src/index.js'
import { getPackageLogger } from '@quajs/logger'

// Example WebSocket transport demonstrating custom pipeline event transport.
const logger = getPackageLogger('pipeline').module('websocket-transport')

export class WebSocketTransport implements PipelineTransport {
  readonly name = 'websocket'

  private ws?: WebSocket
  private readonly url: string
  private connected = false
  private context?: PipelineTransportContext

  constructor(url: string) {
    this.url = url
  }

  async setup(context: PipelineTransportContext): Promise<void> {
    this.context = context
    await this.connect()
  }

  async publish(context: PipelineContext, transport: PipelineTransportContext): Promise<void> {
    if (!this.connected || !this.ws) {
      logger.warn('Not connected, falling back to local delivery')
      await transport.deliver(context)
      return
    }

    try {
      this.ws.send(JSON.stringify({ kind: 'event', event: context.event }))
      logger.debug(`Sent event: ${context.event.type}`)
    }
    catch (error) {
      logger.error('Failed to send event:', error)
      await transport.deliver(context)
    }
  }

  subscribe(type: string): void {
    this.sendControlMessage('subscribe', type)
  }

  unsubscribe(type: string): void {
    this.sendControlMessage('unsubscribe', type)
  }

  dispose(): void {
    this.disconnect()
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

        this.ws.onmessage = (message) => {
          void this.handleMessage(message.data)
        }

        this.ws.onclose = () => {
          logger.info('Connection closed')
          this.connected = false
        }

        this.ws.onerror = (error) => {
          logger.error('WebSocket error:', error)
          reject(error)
        }
      }
      catch (error) {
        reject(error)
      }
    })
  }

  private async handleMessage(message: unknown): Promise<void> {
    try {
      const data = JSON.parse(String(message))
      const event = data.kind === 'event' ? data.event : data

      if (!event || typeof event.type !== 'string' || !('payload' in event)) {
        return
      }

      await this.context?.receive({
        type: event.type,
        payload: event.payload,
        timestamp: typeof event.timestamp === 'number' ? event.timestamp : undefined,
        id: typeof event.id === 'string' ? event.id : undefined,
      })
    }
    catch (error) {
      logger.error('Failed to handle incoming message:', error)
    }
  }

  private sendControlMessage(kind: 'subscribe' | 'unsubscribe', type: string): void {
    if (!this.connected || !this.ws) {
      return
    }

    try {
      this.ws.send(JSON.stringify({ kind, type }))
    }
    catch (error) {
      logger.error(`Failed to send ${kind} message for ${type}:`, error)
    }
  }

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
import { WebSocketTransport } from './websocket-plugin'

const pipeline = new Pipeline({
  transport: new WebSocketTransport('ws://localhost:8080/events')
})

// Now emit calls publish events through WebSocket.
await pipeline.emit('game:action', { action: 'move', direction: 'up' })

// Incoming WebSocket events are injected back through pipeline middleware/listeners.
pipeline.on('game:state', (context) => {
  // eslint-disable-next-line no-console
  console.log('Received game state:', context.event.payload)
})
*/
