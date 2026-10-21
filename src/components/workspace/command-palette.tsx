"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Terminal } from "lucide-react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useVault } from "@/components/vault/vault-provider";
import { environmentPath } from "@/lib/workspace/shared";
import type { TreeOrg } from "@/lib/workspace/manage";

/** Ctrl/Cmd+K: jump to any environment you can open, or lock the vault. */
export function CommandPalette({ org }: { org: TreeOrg }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { lock } = useVault();

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
      <Button variant="ghost" size="sm" className="hidden gap-2 text-bone-faint md:inline-flex" onClick={() => setOpen(true)} aria-label="Open command palette">
        <Terminal className="size-3.5" />
        <kbd className="font-mono text-xs">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Jump to an environment or lock the vault.">
        <Command>
          <CommandInput placeholder="Jump to an environment..." />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            <CommandGroup heading="Environments">
              {org.projects.flatMap((p) =>
                p.environments.map((e) => (
                  <CommandItem
                    key={e.id}
                    value={`${p.name} ${e.name}`}
                    onSelect={() => go(environmentPath({ orgId: org.id, projectId: p.id, envId: e.id }))}
                  >
                    <span className="text-bone-faint">{p.name} /</span> {e.name}
                  </CommandItem>
                )),
              )}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Vault">
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
        </Command>
      </CommandDialog>
    </>
  );
}
