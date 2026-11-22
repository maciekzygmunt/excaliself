import { m } from "@/paraglide/messages"

/** A Better Auth error: the client's `error`, or an `APIError` on the server. */
export type AuthError = { code?: string; message?: string; status?: number }

// The Better Auth 1.7 codes (BASE_ERROR_CODES and the session middleware's
// UNAUTHORIZED) that our forms can get back.
const MESSAGES: Record<string, () => string> = {
  INVALID_EMAIL_OR_PASSWORD: m.auth_error_wrong_credentials,
  INVALID_PASSWORD: m.settings_password_incorrect,
  INVALID_EMAIL: m.auth_email_invalid,
  USER_ALREADY_EXISTS: m.auth_error_user_exists,
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: m.auth_error_user_exists,
  PASSWORD_TOO_SHORT: m.auth_error_password_too_short,
  PASSWORD_TOO_LONG: m.auth_error_password_too_long,
  CREDENTIAL_ACCOUNT_NOT_FOUND: m.auth_error_no_password,
  SESSION_EXPIRED: m.auth_error_session_expired,
  // A settings form sent after the session ended.
  UNAUTHORIZED: m.auth_error_session_expired,
  INVALID_TOKEN: m.auth_error_invalid_token,
  TOKEN_EXPIRED: m.auth_error_invalid_token,
}

/**
 * The error in the user's language. An unknown code keeps Better Auth's
 * English message; no message at all gives `fallback`.
 */
export function authErrorMessage(error: AuthError, fallback: string): string {
  if (error.code && Object.hasOwn(MESSAGES, error.code))
    return MESSAGES[error.code]()
  // Better Auth's rate limiter answers 429 without a code.
  if (error.status === 429) return m.auth_error_rate_limited()
  return error.message || fallback
}
