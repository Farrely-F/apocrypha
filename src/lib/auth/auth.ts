import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { twoFactorGate } from "./two-factor-gate";

// Dev-only password sign-in so tests can get a session without GitHub
// credentials. Needs an explicit flag and is never on in production.
export const testAuthEnabled =
  process.env.APOCRYPHA_TEST_AUTH === "1" && process.env.NODE_ENV !== "production";

/** Which sign-in providers this server has credentials for. */
export const providersEnabled = {
  github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
};

// Authenticator-app sign-in. Real accounts come from GitHub or Google and have
// no password, hence `allowPasswordless`: the guard for changing it is a recent
// sign-in (two-factor-gate.ts), not a password.
const totp = twoFactor({ issuer: "Apocrypha", allowPasswordless: true });

export const auth = betterAuth({
  appName: "Apocrypha",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: { enabled: testAuthEnabled },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
    // The same OAuth web client a Firebase project's Google sign-in uses works here.
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  // The same address from GitHub and from Google is one person, so signing in with a second provider
  // links to the existing account, but only when that provider says it has verified the email. There is
  // deliberately no `trustedProviders`: it would link on an unverified address too, which lets anyone who
  // can register that address at a provider take over the account that owns it.
  // `allowDifferentEmails` only affects the explicit Link button in Settings (someone with a GitHub
  // address and a different Google address). It never applies at sign-in, and that flow needs a sign-in
  // from the last 15 minutes (two-factor-gate.ts), so a stolen session cannot attach a stranger's login.
  account: {
    accountLinking: { enabled: true, allowDifferentEmails: true },
  },
  // A failed OAuth round trip lands back on our page with ?error=<code>.
  onAPIError: { errorURL: "/sign-in" },
  // must be the last plugin
  plugins: [totp, twoFactorGate(totp), nextCookies()],
});
