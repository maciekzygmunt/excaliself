import { APIError } from "better-auth/api"
import { auth } from "@/lib/auth"

/**
 * One-click sign-in for preview and demo routes. Goes through better-auth's
 * own sign-in, so the session is a real one, then redirects with its cookie.
 */
export async function signInAndRedirect(
  request: Request,
  { email, password }: { email: string; password: string },
  location = "/draw",
): Promise<Response> {
  try {
    const { headers } = await auth.api.signInEmail({
      body: { email, password },
      headers: request.headers,
      returnHeaders: true,
    })
    const redirect = new Headers({ location })
    for (const cookie of headers.getSetCookie()) {
      redirect.append("set-cookie", cookie)
    }
    return new Response(null, { status: 302, headers: redirect })
  } catch (error) {
    // Most likely a host outside PREVIEW_HOSTS; better-auth names it.
    if (error instanceof APIError) {
      return new Response(error.message, { status: 400 })
    }
    throw error
  }
}
