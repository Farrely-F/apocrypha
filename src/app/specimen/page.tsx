import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AppShell, Divider, Pane, ShellHeader } from "@/components/shell";

// Dev-only specimen of the shell and theme primitives. Not served in production.
export default function Specimen() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <AppShell
      header={
        <ShellHeader
          actions={<span className="text-xs text-bone-faint">unaudited</span>}
        />
      }
    >
      <div className="mx-auto grid max-w-5xl gap-8 pt-3 lg:grid-cols-[18rem_1fr]">
        <Pane title="Vaults" meta="0 open">
          <p className="text-bone-dim">Nothing is open.</p>
          <p className="mt-1 text-bone-faint">
            Unlock to list what you hold.
          </p>
        </Pane>

        <div className="flex min-w-0 flex-col gap-8">
          <Pane title="Sealed" tone="signal" meta="placeholder">
            <p className="max-w-[65ch] text-bone-dim">
              Secrets are encrypted in this browser before they leave it. The
              server holds ciphertext and cannot read it.
            </p>
            <p className="mt-4 text-bone">
              <span aria-hidden className="text-signal">
                {"> "}
              </span>
              awaiting passphrase
              <span aria-hidden className="mora-caret ml-1" />
            </p>
          </Pane>

          <Pane title="Primitives" meta="specimen">
            <Divider label="buttons" ends />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button>Unlock</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Revoke</Button>
              <Button variant="link">Link</Button>
              <Button disabled>Disabled</Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="xs">xs</Button>
              <Button size="sm">sm</Button>
              <Button size="lg">lg</Button>
            </div>
            <Divider label="rules" weight="double" className="mt-6" />
            <Divider className="mt-4" />
            <p className="mt-4 text-xs text-bone-faint">
              Panes sit beside each other and are never nested. Partition
              inside one with a divider.
            </p>
          </Pane>
        </div>
      </div>
    </AppShell>
  );
}
