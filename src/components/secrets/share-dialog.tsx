"use client";

import { useCallback, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, Link2, Lock, Trash2, X } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PassphraseInput } from "@/components/vault/passphrase-input";
import { sealShare } from "@/lib/share/crypto";
import { EXPIRY_OPTIONS, newShareSchema, type NewShareValues } from "@/lib/share/schemas";
import type { Item } from "./shared";

type Row = {
  id: string;
  envId: string;
  passwordProtected: boolean;
  itemCount: number;
  expiresAt: string | null;
  maxViews: number | null;
  views: number;
  revokedAt: string | null;
  createdAt: string;
  createdByName: string;
};

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json" }, cache: "no-store" });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? "The server could not do that. Try again.");
  return body;
}

function status(r: Row, now: number) {
  if (r.revokedAt) return "revoked";
  if (r.expiresAt && new Date(r.expiresAt).getTime() <= now) return "expired";
  if (r.maxViews !== null && r.views >= r.maxViews) return "used up";
  return "active";
}

/** Share a snapshot of these secrets with someone who has no account: a link, optionally a password, and a limit. */
export function ShareDialog({
  open,
  onOpenChange,
  items,
  scope,
  envId,
  envName,
  orgId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: Item[];
  scope: string;
  envId: string;
  envName: string;
  orgId: string;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [asOf, setAsOf] = useState(0);
  const [showFinished, setShowFinished] = useState(false);
  const form = useForm<NewShareValues>({
    resolver: zodResolver(newShareSchema),
    defaultValues: { protect: false, password: "", expiry: "1440", views: "1" },
  });
  const protect = useWatch({ control: form.control, name: "protect" });

  const load = useCallback(async () => {
    try {
      const data = await call<{ shares: Row[] }>(`/api/organizations/${orgId}/shares`);
      setRows(data.shares.filter((s) => s.envId === envId));
      setAsOf(Date.now());
    } catch {
      setRows([]);
    }
  }, [orgId, envId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open
    if (open) void load();
  }, [open, load]);

  async function onSubmit(v: NewShareValues) {
    try {
      const id = crypto.randomUUID();
      const { envelope, fragment } = await sealShare(id, { title: envName, secrets: items.map((i) => ({ name: i.name, value: i.value })) }, v.protect ? v.password : null);
      const minutes = Number(v.expiry);
      await call(`/api/environments/${envId}/shares`, {
        method: "POST",
        body: JSON.stringify({
          id,
          envelope,
          itemCount: items.length,
          expiresInMinutes: minutes > 0 ? minutes : undefined,
          maxViews: v.views.trim() ? Number(v.views) : undefined,
        }),
      });
      setLink(`${location.origin}/s/${id}#${fragment}`);
      void load();
    } catch (e) {
      form.setError("root.server", { message: (e as Error).message });
    }
  }

  const active = rows.filter((r) => status(r, asOf) === "active");
  const finished = rows.filter((r) => status(r, asOf) !== "active");

  async function clearFinished() {
    await call(`/api/organizations/${orgId}/shares?env=${envId}`, { method: "DELETE" }).catch(() => null);
    setShowFinished(false);
    void load();
  }

  async function revoke(id: string) {
    await call(`/api/shares/${id}`, { method: "DELETE" }).catch(() => null);
    void load();
  }

  const close = (o: boolean) => {
    if (!o) {
      setLink(null);
      setCopied(false);
      form.reset();
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share {scope}</DialogTitle>
          <DialogDescription>
            Anyone with the link can read a snapshot of these secrets, no account needed. It is sealed in this browser; the server never sees the values.
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <div className="grid gap-3">
            <Field>
              <FieldLabel htmlFor="share-link">Link</FieldLabel>
              <div className="flex gap-2">
                <Input id="share-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
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
              <FieldDescription>
                {form.getValues("protect")
                  ? "Send the password separately, not in the same message. Both are needed."
                  : "There is no password: the link is the key. Anyone who gets it can read these secrets until it expires or runs out."}
              </FieldDescription>
            </Field>
            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate aria-label="Share secrets" className="grid gap-4">
            <FieldGroup>
              <Controller
                name="protect"
                control={form.control}
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Switch id="share-protect" checked={field.value} onCheckedChange={field.onChange} />
                    <FieldContent>
                      <FieldLabel htmlFor="share-protect">Require a password</FieldLabel>
                      <FieldDescription>Without one, the link alone opens it.</FieldDescription>
                    </FieldContent>
                  </Field>
                )}
              />
              {protect && (
                <Controller
                  name="password"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="share-password">Password</FieldLabel>
                      <PassphraseInput {...field} id="share-password" autoComplete="off" aria-invalid={fieldState.invalid} />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
              )}
              <div className="grid grid-cols-2 gap-3">
                <Controller
                  name="expiry"
                  control={form.control}
                  render={({ field }) => (
                    <Field>
                      <FieldLabel htmlFor="share-expiry">Expires after</FieldLabel>
                      <Select value={field.value} onValueChange={(v) => v && field.onChange(v)} items={EXPIRY_OPTIONS as unknown as { value: string; label: string }[]}>
                        <SelectTrigger id="share-expiry" aria-label="Expires after">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPIRY_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                />
                <Controller
                  name="views"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="share-views">Max views</FieldLabel>
                      <Input {...field} id="share-views" inputMode="numeric" placeholder="unlimited" autoComplete="off" aria-invalid={fieldState.invalid} />
                    </Field>
                  )}
                />
              </div>
              {form.formState.errors.views && <FieldError errors={[form.formState.errors.views]} />}
              <FieldDescription>
                Sharing {items.length} secret{items.length === 1 ? "" : "s"} from {envName}. The first of the two limits to run out ends the link.
              </FieldDescription>
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
              <Button type="submit" disabled={form.formState.isSubmitting || items.length === 0}>
                <Link2 data-icon="inline-start" />
                {form.formState.isSubmitting ? "Sealing" : "Create link"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {rows.length > 0 && (
          <div className="grid min-w-0 gap-2 border-t pt-3 text-sm">
            <span className="text-bone-faint">
              Active links{active.length ? ` (${active.length})` : ""}
            </span>
            {active.length === 0 && <span className="text-xs text-bone-faint">None. Create one above.</span>}
            <div className="grid max-h-44 gap-2 overflow-y-auto">
              {active.map((r) => (
                <LinkRow key={r.id} r={r} state="active" onRevoke={() => void revoke(r.id)} />
              ))}
            </div>
            {finished.length > 0 && (
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Button type="button" variant="link" size="sm" className="h-auto px-0 text-bone-faint" onClick={() => setShowFinished((v) => !v)} aria-expanded={showFinished}>
                    {showFinished ? "Hide" : "Show"} {finished.length} finished link{finished.length === 1 ? "" : "s"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void clearFinished()}>
                    <Trash2 data-icon="inline-start" />
                    Clear finished
                  </Button>
                </div>
                {showFinished && (
                  <div className="grid max-h-44 gap-2 overflow-y-auto opacity-70">
                    {finished.map((r) => (
                      <LinkRow key={r.id} r={r} state={status(r, asOf)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LinkRow({ r, state, onRevoke }: { r: Row; state: string; onRevoke?: () => void }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2">
          {r.passwordProtected && <Lock className="size-3.5 shrink-0 text-bone-faint" aria-label="Password protected" />}
          <span>
            {r.itemCount} secret{r.itemCount === 1 ? "" : "s"}
          </span>
          <span className="text-bone-faint">
            {r.views}
            {r.maxViews !== null ? ` of ${r.maxViews}` : ""} view{r.views === 1 ? "" : "s"}
          </span>
          <span className={state === "active" ? "text-signal" : "text-blood"}>{state}</span>
        </div>
        {r.expiresAt && <div className="text-xs text-bone-faint">until {new Date(r.expiresAt).toLocaleString()}</div>}
      </div>
      {onRevoke && (
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Revoke link" onClick={onRevoke} />}>
            <X />
          </TooltipTrigger>
          <TooltipContent>Revoke</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
