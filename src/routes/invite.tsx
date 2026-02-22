import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { auth } from "@/lib/auth"
import { consumeInvite, validateInvite } from "@/server/invites"

const registerWithInvite = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { token: string; email: string; password: string; name: string }) =>
      data,
  )
  .handler(async ({ data }) => {
    const invite = await validateInvite({ data: data.token })
    if (!invite) {
      throw new Error("Invalid or expired invite link")
    }

    const result = await auth.api.signUpEmail({
      body: {
        email: data.email,
        password: data.password,
        name: data.name,
      },
    })

    if (!result.user) {
      throw new Error("Failed to create account")
    }

    await consumeInvite({ data: { token: data.token, userId: result.user.id } })

    return { success: true }
  })

export const Route = createFileRoute("/invite")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      token: (search.token as string) || "",
    }
  },
  beforeLoad: async ({ search }) => {
    if (!search.token) {
      throw redirect({ to: "/login" })
    }

    const invite = await validateInvite({ data: search.token })
    if (!invite) {
      throw redirect({ to: "/login" })
    }

    return { invite }
  },
  component: InvitePage,
})

function InvitePage() {
  const { token } = Route.useSearch()
  const navigate = useNavigate()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }

    setLoading(true)
    try {
      await registerWithInvite({ data: { token, email, password, name } })
      navigate({ to: "/login" })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-notion-terracotta text-lg font-semibold text-white">
            E
          </div>
          <div className="text-center">
            <h1 className="text-lg font-medium tracking-[-0.01em] text-foreground">
              You're invited
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your account to start using Excalidraw
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-sm text-muted-foreground">
              Name
            </Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm text-muted-foreground">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm text-muted-foreground">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-sm text-muted-foreground">
              Confirm password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button
            type="submit"
            className="w-full bg-foreground text-background hover:bg-foreground/90"
            disabled={loading}
          >
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>
      </div>
    </div>
  )
}
