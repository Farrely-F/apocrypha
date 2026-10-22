import { connection } from "next/server";

// Sign-in and the second-factor page take credentials, so they are rendered per request: a prerendered
// shell cannot carry the per-request CSP nonce (see lib/security/csp.ts).
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return children;
}
