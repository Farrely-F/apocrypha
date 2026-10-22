"use client";

import { useState } from "react";
import { KeyRound, Lock } from "lucide-react";
import { Pane } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ChangePassphraseDialog } from "@/components/vault/change-passphrase-dialog";
import { useVault } from "@/components/vault/vault-provider";

/** The vault is separate from the account: its passphrase and recovery key never reach the server. */
export function VaultPane() {
  const [open, setOpen] = useState(false);
  const { lock } = useVault();
  return (
    <Pane title="Vault" className="bg-abyss/65 backdrop-blur-md">
      <p className="text-bone-dim">
        Two-step sign-in protects your account. Your secrets are protected by the vault passphrase, which we never see. Lose both the
        passphrase and the recovery key and nobody can open your vault.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          <KeyRound data-icon="inline-start" />
          Change passphrase
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => void lock()}>
          <Lock data-icon="inline-start" />
          Lock now
        </Button>
      </div>
      <ChangePassphraseDialog open={open} onOpenChange={setOpen} />
    </Pane>
  );
}
