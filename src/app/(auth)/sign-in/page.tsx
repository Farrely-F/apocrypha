import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ShellHeader } from "@/components/shell";
import { testAuthEnabled } from "@/lib/auth/auth";
import { signInErrorMessage } from "@/lib/auth/errors";
import { getSession } from "@/lib/auth/session";
import { SignInScreen } from "./sign-in-screen";

// The session and the query string are request-time data, so they are read
// behind a Suspense boundary (Cache Components). Someone already signed in has
// nothing to do here.
async function Gate({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  if (await getSession()) redirect("/dashboard");
  const { error } = await searchParams;
  const code = Array.isArray(error) ? error[0] : error;
  return (
    <SignInScreen
      githubEnabled={Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)}
      testAuth={testAuthEnabled}
      error={signInErrorMessage(code)}
    />
  );
}

// Reads the session (and redirects on it), so it cannot be prerendered into the static shell.
export const instant = false;

export default function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <ShellHeader />
      <main id="main" className="relative flex flex-1 flex-col">
        <Suspense fallback={null}>
          <Gate searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}
