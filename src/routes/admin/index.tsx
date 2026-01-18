import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Users, Mail, Plus, Trash2, Copy, Check } from "lucide-react";
import { useState } from "react";

const getSession = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  const session = await context.auth.api.getSession({
    headers: context.request.headers,
  });
  return session;
});

const checkSetup = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  return context.users.isSetupComplete();
});

const fetchUsers = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  return context.users.getAllUsers();
});

const fetchInvites = createServerFn({ method: "GET" }).handler(async ({ context }) => {
  return context.invites.getPendingInvites();
});

const sendInvite = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string }) => data)
  .handler(async ({ data, context }) => {
    const session = await context.auth.api.getSession({
      headers: context.request.headers,
    });
    if (!session?.user) throw new Error("Unauthorized");
    return context.invites.createInvite(data.email, session.user.id);
  });

const removeInvite = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await context.invites.deleteInvite(data.id);
  });

const fetchUserById = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    return context.users.getUserById(data.id);
  });

export const Route = createFileRoute("/admin/")({
  beforeLoad: async () => {
    const setupComplete = await checkSetup();
    if (!setupComplete) {
      throw redirect({ to: "/setup" });
    }

    const session = await getSession();
    if (!session?.user) {
      throw redirect({ to: "/login" });
    }

    const user = await fetchUserById({ data: { id: session.user.id } });
    if (user?.role !== "admin") {
      throw redirect({ to: "/" });
    }

    return { session };
  },
  loader: async () => {
    const [users, invites] = await Promise.all([fetchUsers(), fetchInvites()]);
    return { users, invites };
  },
  component: AdminPage,
});

function AdminPage() {
  const { users, invites } = Route.useLoaderData();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [localInvites, setLocalInvites] = useState(invites);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await sendInvite({ data: { email } });
      const newInvite = {
        id: result.id,
        email,
        token: result.token,
        invitedBy: "",
        usedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };
      setLocalInvites([...localInvites, newInvite]);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInvite = async (id: string) => {
    await removeInvite({ data: { id } });
    setLocalInvites(localInvites.filter((i) => i.id !== id));
  };

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/invite?token=${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold">Admin Panel</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Users ({users.length})
              </CardTitle>
              <CardDescription>Manage registered users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{user.name || user.email}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        user.role === "admin"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {user.role}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Invitations
              </CardTitle>
              <CardDescription>Invite new users to join</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInvite} className="mb-4 flex gap-2">
                <div className="flex-1">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    required
                  />
                </div>
                <Button type="submit" disabled={loading}>
                  <Plus className="mr-2 h-4 w-4" />
                  Invite
                </Button>
              </form>
              {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
              <div className="space-y-2">
                {localInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{invite.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Expires: {new Date(invite.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyInviteLink(invite.token)}
                      >
                        {copiedToken === invite.token ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => handleDeleteInvite(invite.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {localInvites.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    No pending invitations
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
