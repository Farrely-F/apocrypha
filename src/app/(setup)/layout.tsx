import { connection } from "next/server";

// Creating and resetting a vault take the passphrase, so these pages are rendered per request and can
// carry the per-request CSP nonce (see lib/security/csp.ts).
export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return children;
}
