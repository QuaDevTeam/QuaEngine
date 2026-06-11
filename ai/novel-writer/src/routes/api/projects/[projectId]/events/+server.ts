import type { RequestHandler } from './$types'
import type { RealtimeMessage, WorkflowEvent } from '$lib/types'
import { readEvents } from '$server/store'
import { subscribeProjectRealtimeMessages } from '$server/realtime.js'

export const GET: RequestHandler = async ({ params, request, url }) => {
  const encoder = new TextEncoder()
  const projectId = params.projectId
  const afterEventId = url.searchParams.get('after') || request.headers.get('last-event-id') || undefined
  let closeStream: () => void = () => undefined

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      let unsubscribe: () => void = () => undefined
      let heartbeat: ReturnType<typeof setInterval> | undefined
      const close = () => {
        if (closed) {
          return
        }
        closed = true
        if (heartbeat) {
          clearInterval(heartbeat)
        }
        unsubscribe()
        try {
          controller.close()
        }
        catch {
          // The browser may cancel the stream before the abort signal handler runs.
        }
      }
      closeStream = close
      const send = (event: WorkflowEvent) => {
        if (closed) {
          return
        }
        sendMessage({
          type: 'workflow.event',
          projectId,
          event,
          timestamp: new Date().toISOString(),
        }, event.id)
      }
      const sendMessage = (message: RealtimeMessage, id?: string) => {
        if (closed) {
          return
        }
        controller.enqueue(encoder.encode(`${id ? `id: ${id}\n` : ''}data: ${JSON.stringify(message)}\n\n`))
      }
      const sendComment = (comment: string) => {
        if (closed) {
          return
        }
        controller.enqueue(encoder.encode(`: ${comment}\n\n`))
      }

      let replaying = true
      const pendingMessages: RealtimeMessage[] = []
      unsubscribe = subscribeProjectRealtimeMessages(projectId, message => {
        if (replaying) {
          pendingMessages.push(message)
          return
        }
        sendMessage(message, message.type === 'workflow.event' ? message.event.id : undefined)
      })

      for (const event of eventsAfter(await readEvents(projectId), afterEventId)) {
        send(event)
      }

      replaying = false
      for (const message of pendingMessages) {
        sendMessage(message, message.type === 'workflow.event' ? message.event.id : undefined)
      }

      sendComment('connected')
      heartbeat = setInterval(() => {
        sendComment('ping')
      }, 15000)

      request.signal.addEventListener('abort', close, { once: true })
    },
    cancel() {
      closeStream()
    },
  })

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
    },
  })
}

function eventsAfter(events: WorkflowEvent[], afterEventId: string | undefined): WorkflowEvent[] {
  if (!afterEventId) {
    return events
  }

  const index = events.findIndex(event => event.id === afterEventId)
  return index >= 0 ? events.slice(index + 1) : events
}
