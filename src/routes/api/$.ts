import { createFileRoute } from "@tanstack/react-router"
import { Context } from "effect"
import { disposeApi, handleApiRequest } from "@/api/server"
import { registerShutdownSignals } from "@/server/shutdown-signals"

const shutdownController = new AbortController()
let disposePromise: Promise<void> | undefined

const disposeApiTerminal = (): Promise<void> => {
  shutdownController.abort()
  return (disposePromise ??= disposeApi())
}

const handleRequest = (request: Request): Promise<Response> =>
  handleApiRequest(request, Context.empty()).then((response) => {
    if (response.body === null) return response
    const body = response.body.pipeThrough(new TransformStream(), {
      signal: AbortSignal.any([request.signal, shutdownController.signal]),
    })
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  })

const unregisterShutdownSignals = registerShutdownSignals(process, disposeApiTerminal)

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      ANY: ({ request }) => handleRequest(request),
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unregisterShutdownSignals()
    void disposeApiTerminal()
  })
}
