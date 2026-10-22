"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Pane } from "@/components/shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";
import { devSignInSchema, type DevSignInValues } from "@/lib/auth/schemas";

/**
 * The gate for people who are signed out. Signing in proves who you are; the
 * vault passphrase, asked for next, is what opens your secrets. The backdrop
 * is the painted library (AuthGround), behind a solid pane so the form stays
 * readable.
 */
const PROVIDERS = [
  { id: "google", name: "Google", env: "GOOGLE_CLIENT_ID" },
  { id: "github", name: "GitHub", env: "GITHUB_CLIENT_ID" },
] as const;
type ProviderId = (typeof PROVIDERS)[number]["id"];

export function SignInScreen({
  providers,
  testAuth,
  error,
}: {
  providers: Record<ProviderId, boolean>;
  testAuth: boolean;
  error: string | null;
}) {
  const [redirecting, setRedirecting] = useState<ProviderId | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const missing = PROVIDERS.filter((p) => !providers[p.id]);

  async function social(provider: ProviderId, name: string) {
    setStartError(null);
    setRedirecting(provider);
    try {
      const res = await authClient.signIn.social({ provider, callbackURL: "/dashboard" });
      if (res?.error) throw new Error(res.error.message);
    } catch {
      setRedirecting(null);
      setStartError(`Could not start the ${name} sign-in. Check your connection and try again.`);
    }
  }

  const shown = startError ?? error;

  return (
    <div className="w-full max-w-md">
        <Pane title="Sign in" meta="step 1 of 2" className="mora-frame-corners bg-background">
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
            {PROVIDERS.map((p) => (
              <Button
                key={p.id}
                size="lg"
                variant={p.id === PROVIDERS.find((q) => providers[q.id])?.id ? "default" : "outline"}
                disabled={!providers[p.id] || redirecting !== null}
                onClick={() => void social(p.id, p.name)}
              >
                {redirecting === p.id ? `Opening ${p.name}` : `Continue with ${p.name}`}
              </Button>
            ))}
            {missing.length > 0 && (
              <Alert data-testid="providers-off">
                <AlertDescription>
                  {missing.map((p) => p.name).join(" and ")} sign-in {missing.length > 1 ? "aren't" : "isn't"} set up on this
                  server. Set {missing.map((p) => `${p.env}`).map((id, i) => (
                    <span key={id}>
                      {i > 0 && " and "}
                      <code>{id}</code> and <code>{id.replace("_ID", "_SECRET")}</code>
                    </span>
                  ))}{" "}
                  and restart the server (see <code>.env.example</code>).
                </AlertDescription>
              </Alert>
            )}
          </div>

          {testAuth && <DevSignIn />}
        </Pane>

        <p className="mt-4 text-xs text-bone-faint">
          New here? Signing in creates your account.{" "}
          <Link href="/" className="text-bone-dim underline underline-offset-4 hover:text-signal">
            What is Apocrypha
          </Link>
          . Early development, unaudited.
        </p>
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
    // Two-factor accounts are sent to the code page by the auth client itself.
    if ((res.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) return;
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
