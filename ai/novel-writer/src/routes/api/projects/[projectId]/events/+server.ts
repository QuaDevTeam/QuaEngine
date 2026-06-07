import type { RequestHandler } from './$types'
import type { WorkflowEvent } from '$lib/types'
import { readEvents, subscribeProjectEvents } from '$server/store'

export const GET: RequestHandler = async ({ params, request, url }) => {
  const encoder = new TextEncoder()
  const projectId = params.projectId
  const afterEventId = url.searchParams.get('after') || undefined
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
        controller.enqueue(encoder.encode(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`))
      }

      let replaying = true
      const pendingEvents: WorkflowEvent[] = []
      unsubscribe = subscribeProjectEvents(projectId, event => {
        if (replaying) {
          pendingEvents.push(event)
          return
        }
        send(event)
      })

      for (const event of eventsAfter(await readEvents(projectId), afterEventId)) {
        send(event)
      }

      replaying = false
      for (const event of pendingEvents) {
        send(event)
      }

      heartbeat = setInterval(() => {
        if (!closed) {
          controller.enqueue(encoder.encode(': ping\n\n'))
        }
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
    },
  })
}

function eventsAfter(events: WorkflowEvent[], afterEventId: string | undefined): WorkflowEvent[] {
  if (!afterEventId) {
    return []
  }

  const index = events.findIndex(event => event.id === afterEventId)
  return index >= 0 ? events.slice(index + 1) : events
}
