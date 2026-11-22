import { APIError } from "better-auth/api"
import { authErrorMessage } from "./errors"

/**
 * For server functions that call `auth.api`: a Better Auth error becomes a
 * plain Error in the user's language, since only the message reaches the
 * client. Other errors pass as they are.
 */
export const translateAuthError = (error: unknown, fallback: string) =>
  error instanceof APIError
    ? new Error(
        authErrorMessage(
          {
            code: error.body?.code,
            message: error.message,
            status: error.statusCode,
          },
          fallback,
        ),
      )
    : error
