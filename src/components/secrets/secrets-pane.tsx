"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Ellipsis, Eye, EyeOff, History, Link2, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { Pane } from "@/components/shell";
import { useVault } from "@/components/vault";
import { EmptyState } from "@/components/brand/empty-state";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchEnvironmentKeys, fetchSecrets, postVersion } from "@/lib/secrets/client";
import { serializeDotenv } from "@/lib/secrets/dotenv";
import { openSecret, sealVersion } from "@/lib/secrets/seal";
import { AddSecretForm } from "./add-secret-form";
import { SecretEditor } from "./secret-editor";
import { SecretHistory } from "./secret-history";
import { SecretsImport } from "./secrets-import";
import { ShareDialog } from "./share-dialog";
import { download, type Item } from "./shared";

const REVEAL_FOR_MS = 30_000;
const NOTICE_FOR_MS = 6_000;
const MASK = "••••••••";

type Loaded =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; items: Item[]; unreadable: { id: string; reason: string }[] };

type Sort = "name" | "newest" | "oldest";
const SORTS = [
  { value: "name", label: "Name" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

/** A small icon button with a tooltip: the way row actions are shown. */
function IconAction({
  label,
  onClick,
  children,
  pressed,
  className,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  pressed?: boolean;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={pressed}
            onClick={onClick}
            className={`[&_svg]:size-4 ${className ?? ""}`}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function SecretsPane({
  envId,
  envName,
  orgId,
  keyVersion,
  canWrite,
  currentUserId,
}: {
  envId: string;
  orgId: string;
  envName: string;
  /** The environment's current key version: what new versions are sealed with. */
  keyVersion: number;
  canWrite: boolean;
  currentUserId: string;
}) {
  const { status, keyPair } = useVault();
  const [keys, setKeys] = useState<ReadonlyMap<number, Uint8Array>>(new Map());
  const held = useRef<Map<number, Uint8Array>>(new Map());
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [editing, setEditing] = useState<string | null>(null);
  const [historyOf, setHistoryOf] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState<Item[] | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sharing, setSharing] = useState<Item[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(
    async (opened: ReadonlyMap<number, Uint8Array>) => {
      const rows = await fetchSecrets(envId);
      const results = await Promise.all(rows.map((r) => openSecret(opened, envId, r)));
      setLoaded({
        state: "ready",
        items: results.filter((r): r is Item => r.ok),
        unreadable: results.flatMap((r) => (r.ok ? [] : [{ id: r.id, reason: r.reason }])),
      });
    },
    [envId],
  );

  // Open the environment key and the secrets whenever the vault is unlocked.
  // The key bytes are wiped when the vault locks or the page goes away.
  useEffect(() => {
    if (status !== "unlocked" || !keyPair) return;
    let cancelled = false;
    (async () => {
      try {
        const opened = await fetchEnvironmentKeys(envId, keyPair);
        if (cancelled) return;
        held.current = opened;
        setKeys(opened);
        await refresh(opened);
      } catch (e) {
        if (!cancelled) setLoaded({ state: "error", message: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
      held.current.forEach((k) => k.fill(0));
      held.current = new Map();
    };
  }, [status, keyPair, envId, refresh]);

  // Revealed values hide themselves again; notices fade.
  useEffect(() => {
    if (revealed.size === 0) return;
    const t = setTimeout(() => setRevealed(new Set()), REVEAL_FOR_MS);
    return () => clearTimeout(t);
  }, [revealed]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_FOR_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const items = useMemo(() => (loaded.state === "ready" ? loaded.items : []), [loaded]);
  const names = useMemo(() => new Set(items.map((i) => i.name)), [items]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : [...items];
    list.sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : sort === "newest" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt,
    );
    return list;
  }, [items, filter, sort]);

  const pickedItems = useMemo(() => items.filter((i) => selected.has(i.id)), [items, selected]);
  const allVisibleSelected = visible.length > 0 && visible.every((i) => selected.has(i.id));
  const someVisibleSelected = visible.some((i) => selected.has(i.id));

  const upsert = useCallback((next: Item) => {
    setLoaded((l) => (l.state === "ready" ? { ...l, items: l.items.map((i) => (i.id === next.id ? next : i)) } : l));
  }, []);
  const removeMany = useCallback((ids: ReadonlySet<string>) => {
    setLoaded((l) => (l.state === "ready" ? { ...l, items: l.items.filter((i) => !ids.has(i.id)) } : l));
    setSelected((s) => new Set([...s].filter((id) => !ids.has(id))));
  }, []);
  const added = useCallback((item: Item) => {
    setLoaded((l) => (l.state === "ready" ? { ...l, items: [...l.items, item] } : l));
    setAdding(false);
    setNotice(`${item.name} added.`);
  }, []);

  const flip = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
  };

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    } catch {
      setNotice("Copy was blocked by the browser.");
    }
  }

  /** Delete one or many: each becomes a tombstone version, history is kept. */
  async function deleteItems(list: Item[]) {
    setDeleting(null);
    const key = held.current.get(keyVersion);
    if (!key) return setNotice("This environment's key is not available. Reload the page.");
    setDeleteBusy(true);
    const gone = new Set<string>();
    let conflicts = 0;
    let failed: string | null = null;
    for (const item of list) {
      try {
        const body = await sealVersion(key, envId, item.id, item.version + 1, keyVersion, item.name, "", true);
        const res = await postVersion(envId, item.id, body);
        if (res.ok) gone.add(item.id);
        else if ("conflict" in res) conflicts++;
        else failed = res.error;
      } catch {
        failed = "Could not reach the server.";
      }
    }
    removeMany(gone);
    setDeleteBusy(false);
    const n = gone.size;
    const parts = [`${n} ${n === 1 ? "secret" : "secrets"} deleted. History is kept.`];
    if (conflicts) parts.push(`${conflicts} changed meanwhile and were left alone.`);
    if (failed) parts.push(failed);
    setNotice(parts.join(" "));
  }

  const forExport = (list: Item[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));
  const dotenv = (list: Item[]) => serializeDotenv(forExport(list).map((i) => ({ name: i.name, value: i.value })));
  const json = (list: Item[]) =>
    JSON.stringify(Object.fromEntries(forExport(list).map((i) => [i.name, i.value])), null, 2) + "\n";

  const ready = loaded.state === "ready";
  const selecting = pickedItems.length > 0;

  return (
    <TooltipProvider delay={300}>
      <Pane flush className="border-0 bg-abyss/65 backdrop-blur-md">
        {loaded.state === "loading" && (
          <div className="flex items-center gap-3 border-b border-hairline-faint px-5 py-4 text-sm text-bone-faint">
            <span aria-hidden className="mora-caret" />
            Opening this environment&apos;s key...
          </div>
        )}
        {loaded.state === "error" && (
          <div className="px-5 py-4">
            <Alert variant="destructive">
              <AlertDescription>{loaded.message}</AlertDescription>
            </Alert>
          </div>
        )}

        {ready && (
          <div className="border-b border-hairline-faint">
            {selecting ? (
              <div className="flex flex-wrap items-center gap-2 bg-signal/[0.045] px-5 py-3">
                <span
                  className="flex items-center gap-2 pr-2 text-[0.65rem] uppercase tracking-[0.2em] text-signal"
                  data-testid="selection-count"
                >
                  <span aria-hidden className="size-1.5 bg-signal" />
                  {pickedItems.length} selected
                </span>
                <Button size="sm" variant="outline" onClick={() => void copyText("sel", dotenv(pickedItems))}>
                  <Copy data-icon="inline-start" />
                  {copied === "sel" ? "Copied" : "Copy as .env"}
                </Button>
                {canWrite && (
                  <Button size="sm" variant="outline" onClick={() => setSharing(pickedItems)}>
                    <Link2 data-icon="inline-start" />
                    Share link
                  </Button>
                )}
                {canWrite && (
                  <Button size="sm" variant="destructive" onClick={() => setDeleting(pickedItems)}>
                    <Trash2 data-icon="inline-start" />
                    Delete
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
                  <X data-icon="inline-start" />
                  Clear
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 px-5 py-3">
                <InputGroup className="h-8 w-full min-w-0 bg-abyss/50 sm:w-60">
                  <InputGroupAddon aria-hidden>
                    <Search className="text-bone-faint" />
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-label="Filter secrets by name"
                    className="h-full"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Find a name"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {filter && (
                    <InputGroupAddon align="inline-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Clear filter"
                        className="text-bone-faint hover:text-signal"
                        onClick={() => setFilter("")}
                      >
                        <X />
                      </Button>
                    </InputGroupAddon>
                  )}
                </InputGroup>

                <Select value={sort} onValueChange={(v) => v && setSort(v as Sort)} items={SORTS}>
                  <SelectTrigger aria-label="Sort secrets" className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <span className="ml-auto flex items-center gap-1">
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <DropdownMenuTrigger
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="[&_svg]:size-4"
                                aria-label="Export secrets"
                                disabled={items.length === 0}
                              />
                            }
                          />
                        }
                      >
                        <Download />
                      </TooltipTrigger>
                      <TooltipContent>Export</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Writes every value in plain text</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => download(`${envName}.env`, dotenv(items))}>Download .env</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => download(`${envName}.json`, json(items), "application/json")}>
                          Download JSON
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void copyText("export", dotenv(items))}>Copy as .env</DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {canWrite && (
                    <>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="[&_svg]:size-4"
                              aria-label="Share secrets"
                              disabled={items.length === 0}
                              onClick={() => setSharing(items)}
                            />
                          }
                        >
                          <Link2 />
                        </TooltipTrigger>
                        <TooltipContent>Share</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="[&_svg]:size-4"
                              aria-label="Import a .env"
                              onClick={() => setImporting(true)}
                            />
                          }
                        >
                          <Upload />
                        </TooltipTrigger>
                        <TooltipContent>Import a .env</TooltipContent>
                      </Tooltip>
                      <span aria-hidden className="mx-1 h-5 w-px bg-hairline-faint" />
                      <Button size="sm" aria-label="Add secret" onClick={() => setAdding(true)}>
                        <Plus data-icon="inline-start" />
                        <span className="hidden sm:inline">Add secret</span>
                      </Button>
                    </>
                  )}
                </span>
              </div>
            )}
          </div>
        )}

        {notice && (
          <div className="px-5 pt-4">
            <Alert data-testid="notice">
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          </div>
        )}

        {ready && items.length === 0 && (
          <EmptyState title="The registry is empty">
            {canWrite
              ? "Anything you add is encrypted in this browser with this environment's key before it leaves it."
              : "Nothing has been added here. You can read this environment, but only people with write access can add secrets."}
          </EmptyState>
        )}
        {ready && items.length > 0 && visible.length === 0 && (
          <div className="border-t border-hairline-faint px-5 py-10 text-center">
            <p className="font-display text-xl text-bone">Nothing under &ldquo;{filter}&rdquo;</p>
            <p className="mt-1 text-sm text-bone-faint">The registry is still there; clear the filter to see it.</p>
          </div>
        )}

        {visible.length > 0 && (
          <>
            <Table className="min-w-[44rem]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 w-12 pl-5">
                    <Checkbox
                      aria-label="Select all"
                      checked={allVisibleSelected}
                      indeterminate={!allVisibleSelected && someVisibleSelected}
                      onCheckedChange={(c) =>
                        setSelected(c ? new Set([...selected, ...visible.map((i) => i.id)]) : new Set([...selected].filter((id) => !visible.some((v) => v.id === id))))
                      }
                    />
                  </TableHead>
                  <TableHead className="h-9 w-10 pr-0 text-[0.65rem] font-normal uppercase tracking-[0.2em] text-bone-faint">
                    No.
                  </TableHead>
                  <TableHead className="h-9 text-[0.65rem] font-normal uppercase tracking-[0.2em] text-bone-faint">
                    Name
                  </TableHead>
                  <TableHead className="h-9 w-[38%] text-[0.65rem] font-normal uppercase tracking-[0.2em] text-bone-faint">
                    Sealed value
                  </TableHead>
                  <TableHead className="h-9 w-24 pr-3 text-right sm:w-28">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((item, index) => {
                  const shown = revealed.has(item.id);
                  const lines = item.value.split("\n").length;
                  return (
                    <Fragment key={item.id}>
                      <TableRow
                        data-secret={item.name}
                        data-state={selected.has(item.id) ? "selected" : undefined}
                        className="group/row h-14 border-hairline-faint transition-colors hover:bg-pane/50 data-[state=selected]:bg-signal/[0.06]"
                      >
                        <TableCell className="pl-5">
                          <Checkbox
                            aria-label={`Select ${item.name}`}
                            checked={selected.has(item.id)}
                            onCheckedChange={() => setSelected(flip(selected, item.id))}
                          />
                        </TableCell>
                        <TableCell className="w-10 pr-0 font-display text-sm text-bone-faint/70 transition-colors group-hover/row:text-signal-dim">
                          {String(index + 1).padStart(2, "0")}
                        </TableCell>
                        <TableCell className="max-w-0">
                          <div className="flex items-center gap-2.5">
                            <span
                              aria-hidden
                              className={cn(
                                "size-1.5 shrink-0 transition-colors",
                                shown ? "bg-signal" : "bg-hairline group-hover/row:bg-signal-dim",
                              )}
                            />
                            <span
                              title={item.name}
                              className="truncate font-medium text-bone transition-colors group-hover/row:text-signal"
                            >
                              {item.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            data-testid={`value-${item.name}`}
                            className={cn(
                              "font-mono text-[0.8rem] tracking-[0.12em]",
                              shown ? "text-signal" : "text-bone-faint/80",
                            )}
                          >
                            {shown ? (
                              <span className="line-clamp-2 break-all whitespace-pre-wrap">{item.value}</span>
                            ) : (
                              MASK
                            )}
                          </span>
                          {shown && lines > 2 && <span className="text-xs text-bone-faint"> +{lines - 2} more lines</span>}
                        </TableCell>
                        <TableCell className="pr-3">
                          <div className="flex justify-end gap-0.5 opacity-70 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                            <IconAction label={shown ? "Hide value" : "Reveal value"} pressed={shown} onClick={() => setRevealed(flip(revealed, item.id))}>
                              {shown ? <EyeOff /> : <Eye />}
                            </IconAction>
                            <IconAction label="Copy value" onClick={() => void copyText(item.id, item.value)}>
                              {copied === item.id ? <Check className="text-signal" /> : <Copy />}
                            </IconAction>
                            <DropdownMenu>
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <DropdownMenuTrigger
                                      render={<Button type="button" variant="ghost" size="icon-sm" className="[&_svg]:size-4" aria-label={`More actions for ${item.name}`} />}
                                    />
                                  }
                                >
                                  <Ellipsis />
                                </TooltipTrigger>
                                <TooltipContent>More</TooltipContent>
                              </Tooltip>
                              <DropdownMenuContent align="end">
                                {canWrite && (
                                  <DropdownMenuItem onClick={() => setEditing(editing === item.id ? null : item.id)}>
                                    <Pencil /> Edit
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => setHistoryOf(item)}>
                                  <History /> History
                                </DropdownMenuItem>
                                {canWrite && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem variant="destructive" onClick={() => setDeleting([item])}>
                                      <Trash2 /> Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                      {editing === item.id && (
                        <TableRow>
                          <TableCell colSpan={5} className="whitespace-normal">
                            <SecretEditor
                              item={item}
                              envId={envId}
                              keyVersion={keyVersion}
                              keys={keys}
                              others={new Set([...names].filter((n) => n !== item.name))}
                              onSaved={(next) => {
                                upsert(next);
                                setEditing(null);
                              }}
                              onGone={() => {
                                removeMany(new Set([item.id]));
                                setEditing(null);
                              }}
                              onCancel={() => setEditing(null)}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline-faint px-5 py-3 text-[0.65rem] uppercase tracking-[0.18em] text-bone-faint">
              <span className="flex items-center gap-2">
                <span aria-hidden className="size-1 bg-signal/70" />
                {filter
                  ? `${visible.length} of ${items.length} ${items.length === 1 ? "entry" : "entries"}`
                  : `${items.length} ${items.length === 1 ? "entry" : "entries"}`}
              </span>
              <span>AES-256-GCM / sealed in this browser</span>
            </div>
          </>
        )}

        {ready && loaded.unreadable.length > 0 && (
          <div className="flex flex-col gap-2 px-5 pb-4 pt-3">
            {loaded.unreadable.map((u) => (
              <Alert key={u.id} variant="destructive">
                <AlertDescription>A secret in this environment {u.reason}. It is still stored, untouched.</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add a secret</DialogTitle>
              <DialogDescription>It is encrypted in this browser with this environment&apos;s key before it is sent.</DialogDescription>
            </DialogHeader>
            <AddSecretForm envId={envId} keyVersion={keyVersion} keys={keys} names={names} onAdded={added} />
          </DialogContent>
        </Dialog>

        <Dialog open={importing} onOpenChange={setImporting}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Import a .env file</DialogTitle>
              <DialogDescription>New names are added. Names that already exist are left alone unless you choose to update them.</DialogDescription>
            </DialogHeader>
            <SecretsImport
              envId={envId}
              keyVersion={keyVersion}
              keys={keys}
              existing={items}
              onDone={(summary) => {
                setImporting(false);
                setNotice(summary);
                void refresh(keys);
              }}
            />
          </DialogContent>
        </Dialog>

        {sharing && (
          <ShareDialog
            open
            onOpenChange={(o) => !o && setSharing(null)}
            items={sharing}
            scope={sharing.length === items.length ? `all ${items.length} secrets` : `${sharing.length} selected secret${sharing.length === 1 ? "" : "s"}`}
            envId={envId}
            envName={envName}
            orgId={orgId}
          />
        )}
        <Sheet open={historyOf !== null} onOpenChange={(o) => !o && setHistoryOf(null)}>
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
            <SheetHeader>
              <SheetTitle>History of {historyOf?.name}</SheetTitle>
              <SheetDescription>Every version, newest first. Values stay hidden until you show them.</SheetDescription>
            </SheetHeader>
            {historyOf && (
              <SecretHistory
                item={historyOf}
                envId={envId}
                keyVersion={keyVersion}
                keys={keys}
                canWrite={canWrite}
                currentUserId={currentUserId}
                onRestored={(next) => {
                  upsert(next);
                  setHistoryOf(next);
                }}
              />
            )}
          </SheetContent>
        </Sheet>

        <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {deleting && deleting.length === 1 ? `Delete ${deleting[0].name}?` : `Delete ${deleting?.length ?? 0} secrets?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleting && deleting.length > 1 && (
                  <span className="mb-2 block break-all text-bone">
                    {deleting.slice(0, 5).map((d) => d.name).join(", ")}
                    {deleting.length > 5 ? ` and ${deleting.length - 5} more` : ""}
                  </span>
                )}
                They disappear from this list. Their history is kept on the server, sealed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={deleteBusy} onClick={() => deleting && void deleteItems(deleting)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Pane>
    </TooltipProvider>
  );
}
