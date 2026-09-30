import { Readable } from 'node:stream'

/** Electron's Chromium transport reads OS proxy, PAC and bypass settings. */
export async function editorFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  if (process.versions.electron) {
    const { net } = await import('electron')
    return net.fetch(input instanceof URL ? input.href : input, { credentials: 'omit', ...init })
  }
  return fetch(input, init)
}

/** Check every redirect, since Electron's Response.url is not the final URL. */
export async function fetchHttps(url: string, signal: AbortSignal): Promise<Response> {
  if (new URL(url).protocol !== 'https:')
    throw new Error('Editor update redirect requires HTTPS.')
  if (process.versions.electron) {
    const { net } = await import('electron')
    signal.throwIfAborted()
    // net.fetch rejects manual redirects rather than exposing a 3xx Response.
    // ClientRequest lets us approve each hop before Chromium sends it.
    return new Promise<Response>((accept, reject) => {
      const request = net.request({ url, redirect: 'manual', useSessionCookies: false })
      let redirects = 0
      const abort = (): void => {
        request.abort()
        reject(signal.reason)
      }
      signal.addEventListener('abort', abort, { once: true })
      request.setHeader('Cache-Control', 'no-cache')
      request.on('redirect', (_status, _method, destination) => {
        if (new URL(destination).protocol !== 'https:' || ++redirects > 10) {
          reject(new Error('Editor update redirect requires HTTPS and at most ten hops.'))
          request.abort()
        }
        else {
          request.followRedirect()
        }
      })
      request.once('error', reject)
      request.once('close', () => signal.removeEventListener('abort', abort))
      request.once('response', (response) => {
        try {
          const headers = new Headers()
          for (const [key, value] of Object.entries(response.headers)) {
            for (const item of Array.isArray(value) ? value : [value])
              headers.append(key, item)
          }
          const stream = response as unknown as Readable
          const body = [204, 205, 304].includes(response.statusCode) ? null : Readable.toWeb(stream) as ReadableStream<Uint8Array>
          if (!body)
            stream.resume()
          accept(new Response(body, { status: response.statusCode, headers }))
        }
        catch (error) {
          reject(error)
          request.abort()
        }
      })
      request.end()
    })
  }
  for (let redirects = 0; redirects <= 10; redirects++) {
    if (new URL(url).protocol !== 'https:')
      throw new Error('Editor update redirect requires HTTPS.')
    const response = await editorFetch(url, { signal, redirect: 'manual', cache: 'no-store' })
    if (![301, 302, 303, 307, 308].includes(response.status))
      return response
    await response.body?.cancel()
    const location = response.headers.get('location')
    if (!location)
      throw new Error('Editor update redirect is missing its destination.')
    url = new URL(location, url).href
  }
  throw new Error('Too many editor update redirects.')
}
