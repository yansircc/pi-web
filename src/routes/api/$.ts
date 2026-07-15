import { createFileRoute } from "@tanstack/react-router"
import { Context } from "effect"
import { disposeApi, handleApiRequest } from "@/api/server"

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      ANY: ({ request }) => handleApiRequest(request, Context.empty()),
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void disposeApi()
  })
}
