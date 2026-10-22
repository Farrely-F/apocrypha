import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import type { twoFactor } from "better-auth/plugins";
import { REAUTH_2FA_MESSAGE, signedInRecently } from "./fresh";
import { TWO_FACTOR_PAGE } from "./two-factor-paths";

type TwoFactorPlugin = ReturnType<typeof twoFactor>;

/**
 * Sign-in routes that end in a session and are NOT covered by the two-factor
 * plugin, which only watches `/sign-in/email`. Without this, anyone who can
 * pass GitHub or Google could skip the authenticator code.
 *
 * - `/callback/:id`, `/oauth2/callback/:id`: the browser redirect back from a provider.
 * - `/sign-in/social`: with an `idToken` it signs in directly, no redirect.
 */
export const OAUTH_REDIRECT_PATHS = /^\/(?:oauth2\/)?callback\/[^/]+$/;
export const SESSION_MAKING_PATHS = (path: string) => OAUTH_REDIRECT_PATHS.test(path) || path === "/sign-in/social";

/** Changing 2FA, reading its secret, or linking or unlinking a provider needs a sign-in from the last 15 minutes. */
export const FRESH_SIGN_IN_PATHS = new Set([
  "/two-factor/enable",
  "/two-factor/disable",
  "/two-factor/generate-backup-codes",
  "/two-factor/get-totp-uri",
  // Unlinking a sign-in method can lock someone out as surely as turning 2FA on.
  "/unlink-account",
  // Linking a provider with a different email lets that login sign in as this account.
  "/link-social",
]);

/**
 * Completes the two-factor plugin for the sign-in methods this app really uses,
 * and puts a recent-sign-in rule in front of the endpoints that change it.
 *
 * It reuses the plugin's own after-hook (trusted-browser check, pending
 * challenge cookie, removal of the half-made session), so the two paths cannot
 * drift. For a browser redirect the JSON "2FA required" answer is turned into
 * a redirect to the code page.
 */
export function twoFactorGate(tf: TwoFactorPlugin): BetterAuthPlugin {
  const gate = tf.hooks?.after?.[0]?.handler;
  if (!gate) throw new Error("two-factor plugin has no sign-in hook; Better Auth changed");

  return {
    id: "two-factor-gate",
    hooks: {
      before: [
        {
          matcher: (ctx) => FRESH_SIGN_IN_PATHS.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const current = await getSessionFromCtx(ctx);
            // No session: the endpoint itself answers 401.
            if (current && !signedInRecently(current.session)) {
              throw new APIError("FORBIDDEN", { message: REAUTH_2FA_MESSAGE, code: "RECENT_SIGN_IN_REQUIRED" });
            }
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => SESSION_MAKING_PATHS(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const result = (await (gate as unknown as (c: unknown) => Promise<{ response?: unknown; headers?: Headers } | undefined>)({
              ...ctx,
              returnHeaders: true,
              asResponse: false,
            })) as { response?: { twoFactorRedirect?: boolean }; headers?: Headers } | undefined;
            if (!result?.response?.twoFactorRedirect) return;

            if (OAUTH_REDIRECT_PATHS.test(ctx.path ?? "")) {
              // Carry the challenge cookie and the cleared session cookie onto the redirect.
              for (const cookie of result.headers?.getSetCookie() ?? []) ctx.responseHeaders.append("set-cookie", cookie);
              throw ctx.redirect(TWO_FACTOR_PAGE);
            }
            return result.response;
          }),
        },
      ],
    },
  };
}
