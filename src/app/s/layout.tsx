import { connection } from "next/server";

// This page opens keys that live in the URL fragment, so it is rendered per request and can carry the
// per-request CSP nonce (see lib/security/csp.ts).
export default async function KeyHolderLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return children;
}
