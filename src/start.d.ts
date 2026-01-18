import type { auth } from "@/lib/auth";
import type { getDb } from "@/lib/db";
import type * as users from "@/server/users";
import type * as drawings from "@/server/drawings";
import type * as invites from "@/server/invites";

type Db = ReturnType<typeof getDb>;

declare module "@tanstack/react-start" {
  interface Register {
    server: {
      requestContext: {
        db: Db;
        auth: typeof auth;
        users: typeof users;
        drawings: typeof drawings;
        invites: typeof invites;
        request: Request;
      };
    };
  }
}
