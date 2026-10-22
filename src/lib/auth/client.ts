"use client";

import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { TWO_FACTOR_PAGE } from "./two-factor-paths";

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      // Email sign-in answers with "code needed" instead of a session; provider
      // sign-ins are redirected to the same page by the server.
      onTwoFactorRedirect() {
        window.location.href = TWO_FACTOR_PAGE;
      },
    }),
  ],
});
