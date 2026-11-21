import handler from "@tanstack/react-start/server-entry"
import "@/lib/language"
import { paraglideMiddleware } from "@/paraglide/server"

// Runs every page and server fn request inside Paraglide's per-request
// locale, so getLocale() and m.*() answer in the request's language.
export default {
  fetch: (request: Request) =>
    paraglideMiddleware(request, () => handler.fetch(request)),
}
