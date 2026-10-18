"use server"

import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { db } from "@/db"
import { authMiddleware } from "@/middleware/auth"
import {
  createAccessToken,
  listAccessTokens,
  revokeAccessToken,
} from "./tokens"

// Every function acts on the caller's own tokens only.

export const getAccessTokens = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context }) => listAccessTokens(db, context.session.user.id))

export const createToken = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ name: z.string().trim().min(1).max(100) }))
  .handler(({ data, context }) =>
    createAccessToken(db, context.session.user.id, data.name),
  )

export const revokeToken = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(({ data, context }) =>
    revokeAccessToken(db, context.session.user.id, data.id),
  )
