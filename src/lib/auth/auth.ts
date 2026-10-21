import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

// Dev-only password sign-in so tests can get a session without GitHub
// credentials. Needs an explicit flag and is never on in production.
export const testAuthEnabled =
  process.env.APOCRYPHA_TEST_AUTH === "1" && process.env.NODE_ENV !== "production";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: { enabled: testAuthEnabled },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
  },
  // A failed OAuth round trip lands back on our page with ?error=<code>.
  onAPIError: { errorURL: "/sign-in" },
  // must be the last plugin
  plugins: [nextCookies()],
});
