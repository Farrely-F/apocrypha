"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Boxes, CornerDownLeft, FolderTree, KeyRound, Lock, Search, Terminal } from "lucide-react";
import { Command, CommandDialog, CommandEmpty, CommandFooter, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChangePassphraseDialog } from "@/components/vault/change-passphrase-dialog";
import { useVault } from "@/components/vault/vault-provider";
import { environmentPath, orgPath, projectPath } from "@/lib/workspace/shared";
import type { TreeOrg } from "@/lib/workspace/manage";

/** Ctrl/Cmd+K: jump to any environment you can open, or lock the vault. */
export function CommandPalette({ tree }: { tree: TreeOrg[] }) {
  const [open, setOpen] = useState(false);
  const [passphrase, setPassphrase] = useState(false);
  const router = useRouter();
  const { lock } = useVault();
  const pathname = usePathname();
  // The org you are in, from the URL; otherwise the first one you belong to.
  const currentId = /^\/o\/([^/]+)/.exec(pathname)?.[1];
  const current = tree.find((o) => o.id === currentId) ?? tree[0] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="absolute top-1/2 left-1/2 z-10 hidden h-8 w-64 -translate-x-1/2 -translate-y-1/2 justify-start gap-2 border-hairline-faint bg-pane px-2.5 font-normal text-bone-faint hover:border-signal-dim hover:text-bone md:inline-flex"
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
      >
        <Search className="size-3.5" />
        <span className="truncate">Jump to...</span>
        <kbd className="ml-auto text-[0.6875rem] tracking-wide text-bone-faint">Ctrl K</kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-bone-faint md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
      >
        <Search />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Jump to an environment or lock the vault.">
        <Command>
          <CommandInput placeholder="Jump to an environment, project or action" />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            <CommandGroup heading="Environments">
              {tree.flatMap((org) =>
                org.projects.flatMap((p) =>
                  p.environments.map((e) => (
                    <CommandItem
                      key={e.id}
                      value={`${org.name} ${p.name} ${e.name}`}
                      onSelect={() => go(environmentPath({ orgId: org.id, projectId: p.id, envId: e.id }))}
                    >
                      <Terminal />
                      <span className="truncate">{e.name}</span>
                      <span className="ml-auto truncate text-xs text-bone-faint">
                        {org.name} / {p.name}
                      </span>
                    </CommandItem>
                  )),
                ),
              )}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Browse">
              <CommandItem value="all organisations" onSelect={() => go("/dashboard")}>
                <Boxes /> All organisations
              </CommandItem>
              {tree.map((o) => (
                <CommandItem key={o.id} value={`organisation ${o.name}`} onSelect={() => go(orgPath(o.id))}>
                  <Boxes /> {o.name}
                  <span className="ml-auto text-xs text-bone-faint">{o.projects.length} projects</span>
                </CommandItem>
              ))}
              {current?.projects.map((p) => (
                <CommandItem key={p.id} value={`project ${current.name} ${p.name}`} onSelect={() => go(projectPath(current.id, p.id))}>
                  <FolderTree /> {p.name}
                  <span className="ml-auto text-xs text-bone-faint">{p.environments.length} env</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Vault">
              <CommandItem
                value="change passphrase"
                onSelect={() => {
                  setOpen(false);
                  setPassphrase(true);
                }}
              >
                <KeyRound /> Change passphrase
              </CommandItem>
              <CommandItem
                value="lock vault"
                onSelect={() => {
                  setOpen(false);
                  void lock();
                }}
              >
                <Lock /> Lock vault
              </CommandItem>
            </CommandGroup>
          </CommandList>
          <CommandFooter>
            <span>
              <kbd>↑↓</kbd> move
            </span>
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft className="size-3" /> open
            </span>
            <span className="ml-auto">
              <kbd>Ctrl K</kbd> toggle
            </span>
          </CommandFooter>
        </Command>
      </CommandDialog>
      <ChangePassphraseDialog open={passphrase} onOpenChange={setPassphrase} />
    </>
  );
}
