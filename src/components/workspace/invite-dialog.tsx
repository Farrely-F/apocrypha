"use client";

import { useCallback, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, X } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { z } from "@/lib/zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useVault } from "@/components/vault/vault-provider";
import { sealInvite } from "@/lib/invites/link";
import { fetchEnvironmentKeys } from "@/lib/secrets/client";
import type { TreeOrg } from "@/lib/workspace/manage";

const schema = z.object({
  email: z.union([z.literal(""), z.email("That does not look like an email address.")]),
  envs: z.array(z.string()).min(1, "Pick at least one environment."),
});
type Values = z.infer<typeof schema>;
type Pending = { id: string; email: string | null; expiresAt: string };

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json" }, cache: "no-store" });
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(body?.error ?? "The server could not do that. Try again.");
  return body as Record<string, unknown>;
}

/** Invite someone to read chosen environments. The link carries the key; the server never sees it. */
export function InviteDialog({ org, open, onOpenChange }: { org: TreeOrg; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { keyPair } = useVault();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", envs: [] } });

  const load = useCallback(async () => {
    try {
      setPending(((await call(`/api/organizations/${org.id}/invites`)) as { invites: Pending[] }).invites);
    } catch {
      setPending([]);
    }
  }, [org.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open
    if (open) void load();
  }, [open, load]);

  async function onSubmit(values: Values) {
    if (!keyPair) return form.setError("root.server", { message: "Unlock your vault first." });
    try {
      const keys = [];
      for (const envId of values.envs) {
        const held = await fetchEnvironmentKeys(envId, keyPair);
        // every version we hold, so the newcomer can read older secrets too
        for (const [version, key] of held) keys.push({ envId, keyVersion: version, key });
      }
      const sealed = await sealInvite(keys);
      keys.forEach((k) => k.key.fill(0));
      const made = (await call(`/api/organizations/${org.id}/invites`, {
        method: "POST",
        body: JSON.stringify({ email: values.email || undefined, ephemeralPublicKey: sealed.ephemeralPublicKey, redeemHash: sealed.redeemHash, grants: sealed.grants }),
      })) as { inviteId: string };
      setLink(`${location.origin}/join/${made.inviteId}#${sealed.fragment}`);
      void load();
    } catch (e) {
      form.setError("root.server", { message: (e as Error).message });
    }
  }

  async function revoke(id: string) {
    await call(`/api/invites/${id}`, { method: "DELETE" }).catch(() => null);
    void load();
  }

  const close = (o: boolean) => {
    if (!o) {
      setLink(null);
      form.reset();
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite to {org.name}</DialogTitle>
          <DialogDescription>They join as a member with read access to the environments you pick. The link works once and expires in 48 hours.</DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="grid gap-3">
            <Field>
              <FieldLabel htmlFor="invite-link">Invite link</FieldLabel>
              <div className="flex gap-2">
                <Input id="invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Copy link"
                  onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
              </div>
              <FieldDescription>Send it over a private channel. Anyone with the whole link can read those environments, so treat it like a password.</FieldDescription>
            </Field>
            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate aria-label="Invite member" className="grid gap-4">
            <FieldGroup>
              <Controller
                name="envs"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>Environments</FieldLabel>
                    <div className="grid max-h-40 gap-2 overflow-auto">
                      {org.projects.flatMap((p) =>
                        p.environments.map((e) => (
                          <label key={e.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={field.value.includes(e.id)}
                              onCheckedChange={(c) => field.onChange(c ? [...field.value, e.id] : field.value.filter((x) => x !== e.id))}
                            />
                            <span className="text-bone-faint">{p.name} /</span> {e.name}
                          </label>
                        )),
                      )}
                    </div>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="invite-email">Email (optional)</FieldLabel>
                    <Input {...field} id="invite-email" type="email" autoComplete="off" aria-invalid={fieldState.invalid} />
                    <FieldDescription>If set, only a verified account with this address can use the link.</FieldDescription>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                )}
              />
            </FieldGroup>
            {form.formState.errors.root?.server && (
              <Alert variant="destructive">
                <AlertDescription>{form.formState.errors.root.server.message}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Create invite link
              </Button>
            </DialogFooter>
          </form>
        )}
        {pending.length > 0 && (
          <div className="grid min-w-0 gap-2 border-t pt-3 text-sm">
            <span className="text-bone-faint">Pending invites</span>
            {pending.map((p) => (
              <div key={p.id} className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate">{p.email ?? "Anyone with the link"}</div>
                  <div className="text-xs text-bone-faint">until {new Date(p.expiresAt).toLocaleString()}</div>
                </div>
                <Tooltip>
                  <TooltipTrigger render={<Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Revoke invite" onClick={() => void revoke(p.id)} />}>
                    <X />
                  </TooltipTrigger>
                  <TooltipContent>Revoke</TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
