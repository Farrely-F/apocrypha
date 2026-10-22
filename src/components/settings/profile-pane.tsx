"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { UserAvatar } from "@/components/brand/user-avatar";
import { Pane } from "@/components/shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/client";

const schema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80, "Keep it under 80 characters."),
});
type Values = z.infer<typeof schema>;

/** The name shown to teammates. The email is the sign-in identity, so it is read-only. */
export function ProfilePane({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name } });
  const { isSubmitting, isDirty, isSubmitSuccessful } = form.formState;

  async function onSubmit(values: Values) {
    const res = await authClient.updateUser({ name: values.name });
    if (res.error) {
      form.setError("root.server", { message: res.error.message ?? "Could not save your name." });
      return;
    }
    form.reset({ name: values.name });
    router.refresh();
  }

  return (
    <Pane title="Profile" className="bg-abyss/65 backdrop-blur-md">
      <div className="mb-5 flex items-center gap-4">
        <UserAvatar name={email} size={64} />
        <p className="text-xs text-bone-faint">
          Drawn in your browser from your email, so it is the same on every device. Nothing is uploaded.
        </p>
      </div>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate aria-label="Profile">
        <FieldGroup>
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="profile-name">Name</FieldLabel>
                <Input {...field} id="profile-name" autoComplete="name" aria-invalid={fieldState.invalid} />
                {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : <FieldDescription>Shown to people in your organisations.</FieldDescription>}
              </Field>
            )}
          />
          <Field>
            <FieldLabel htmlFor="profile-email">Email</FieldLabel>
            <Input id="profile-email" value={email} readOnly disabled />
            <FieldDescription>It comes from your sign-in provider and identifies your account.</FieldDescription>
          </Field>
        </FieldGroup>
        {form.formState.errors.root?.server && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{form.formState.errors.root.server.message}</AlertDescription>
          </Alert>
        )}
        <div className="mt-5 flex items-center gap-3">
          <Button type="submit" size="sm" disabled={!isDirty || isSubmitting}>
            {isSubmitting ? "Saving" : "Save name"}
          </Button>
          {isSubmitSuccessful && !isDirty && <span className="text-xs text-signal-dim">Saved</span>}
        </div>
      </form>
    </Pane>
  );
}
