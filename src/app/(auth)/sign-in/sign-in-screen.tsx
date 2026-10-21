"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import FaultyTerminal from "@/components/FaultyTerminal";
import { Pane } from "@/components/shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";
import { devSignInSchema, type DevSignInValues } from "@/lib/auth/schemas";

/**
 * The gate for people who are signed out. Signing in proves who you are; the
 * vault passphrase, asked for next, is what opens your secrets. FaultyTerminal
 * is the backdrop (effects on landing and the gates only), dim and behind a
 * solid pane so the form stays readable.
 */
export function SignInScreen({
  githubEnabled,
  testAuth,
  error,
}: {
  githubEnabled: boolean;
  testAuth: boolean;
  error: string | null;
}) {
  const [redirecting, setRedirecting] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);

  async function github() {
    setGithubError(null);
    setRedirecting(true);
    try {
      const res = await authClient.signIn.social({ provider: "github", callbackURL: "/dashboard" });
      if (res?.error) throw new Error(res.error.message);
    } catch {
      setRedirecting(false);
      setGithubError("Could not start the GitHub sign-in. Check your connection and try again.");
    }
  }

  const shown = githubError ?? error;

  return (
    <div className="relative grid flex-1 place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden className="absolute inset-0 z-0">
        <FaultyTerminal
          tint="#3ddc97"
          glyphs="characters"
          brightness={0.6}
          scanlineIntensity={0.35}
          curvature={0.1}
          glow={0.35}
          vignette={0.6}
          digitSize={3}
          timeScale={0.2}
          mouseReact={false}
          clickEffect="none"
          variation={undefined}
          dpr={undefined}
          style={undefined}
        />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <Pane title="Sign in" meta="step 1 of 2" className="bg-background">
          <p className="text-bone-dim">
            Signing in proves who you are. Next you&apos;ll enter your vault passphrase, which is what opens your
            secrets. We never see it.
          </p>

          {shown && (
            <Alert variant="destructive" className="mt-5" data-testid="sign-in-error">
              <AlertDescription>{shown}</AlertDescription>
            </Alert>
          )}

          <div className="mt-6 flex flex-col gap-3">
            <Button size="lg" disabled={!githubEnabled || redirecting} onClick={() => void github()}>
              {redirecting ? "Opening GitHub" : "Continue with GitHub"}
            </Button>
            {!githubEnabled && (
              <Alert data-testid="github-off">
                <AlertDescription>
                  GitHub sign-in isn&apos;t set up on this server. Set <code>GITHUB_CLIENT_ID</code> and{" "}
                  <code>GITHUB_CLIENT_SECRET</code> (see <code>.env.example</code>).
                </AlertDescription>
              </Alert>
            )}
          </div>

          {testAuth && <DevSignIn />}
        </Pane>

        <p className="mt-4 bg-background/80 py-1 text-center text-xs text-bone-faint">
          New here? Signing in creates your account.{" "}
          <Link href="/" className="text-bone-dim underline underline-offset-4 hover:text-signal">
            What is Apocrypha
          </Link>
          . Early development, unaudited.
        </p>
      </div>
    </div>
  );
}

/** Email and password for local testing only; the server turns it off in production. */
function DevSignIn() {
  const router = useRouter();
  const form = useForm<DevSignInValues>({
    resolver: zodResolver(devSignInSchema),
    defaultValues: { email: "", password: "" },
  });
  const { isSubmitting, errors } = form.formState;

  async function run(values: DevSignInValues, create: boolean) {
    const res = create
      ? await authClient.signUp.email({ ...values, name: values.email.split("@")[0], callbackURL: "/dashboard" })
      : await authClient.signIn.email({ ...values, callbackURL: "/dashboard" });
    if (res.error) {
      form.setError("root.server", { message: res.error.message ?? "That didn't work." });
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <form onSubmit={form.handleSubmit((v) => run(v, false))} noValidate aria-label="Dev sign-in" className="mt-6">
      <FieldSeparator>dev only</FieldSeparator>
      <FieldGroup className="mt-4">
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="dev-email">Email</FieldLabel>
              <Input {...field} id="dev-email" type="email" autoComplete="email" aria-invalid={fieldState.invalid} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="dev-password">Password</FieldLabel>
              <Input {...field} id="dev-password" type="password" autoComplete="current-password" aria-invalid={fieldState.invalid} />
              {fieldState.invalid ? (
                <FieldError errors={[fieldState.error]} />
              ) : (
                <FieldDescription>Only exists while APOCRYPHA_TEST_AUTH=1. It is off in production.</FieldDescription>
              )}
            </Field>
          )}
        />
      </FieldGroup>
      {errors.root?.server && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{errors.root.server.message}</AlertDescription>
        </Alert>
      )}
      <div className="mt-4 flex gap-2">
        <Button type="submit" variant="outline" disabled={isSubmitting}>
          Sign in
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={form.handleSubmit((v) => run(v, true))}
        >
          Create test account
        </Button>
      </div>
    </form>
  );
}
