import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/** Validated server-side session (DB lookup), or null when signed out. */
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

/** Use in layouts, pages, server actions and route handlers that need a user. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}
