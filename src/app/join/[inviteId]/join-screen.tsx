"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthStage, Pane } from "@/components/shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { openInvite, readFragment } from "@/lib/invites/link";

type Offer = { orgName: string; grants: { envId: string; keyVersion: number; wrappedKey: string }[] };
type State = "loading" | "signin" | "novault" | "invalid" | "ready" | "joining";

const storeKey = (id: string) => `apocrypha:invite:${id}`;

/**
 * The key to open the invite is in the URL fragment. It is moved into
 * sessionStorage straight away (and removed from the address bar) so it
 * survives the sign-in round trip in this tab and never lands in history.
 */
export function JoinScreen({ inviteId }: { inviteId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [offer, setOffer] = useState<Offer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        if (location.hash.length > 1) {
          sessionStorage.setItem(storeKey(inviteId), location.hash.slice(1));
          history.replaceState(null, "", location.pathname);
        }
      } catch {
        /* storage unavailable: the link must be opened and used in one go */
      }
      let token = "";
      try {
        token = readFragment(sessionStorage.getItem(storeKey(inviteId)) ?? "").token;
      } catch {
        return setState("invalid");
      }
      const res = await fetch(`/api/invites/${inviteId}`, { cache: "no-store", headers: { "x-invite-token": token } });
      if (res.status === 401) return setState("signin");
      if (!res.ok) return setState("invalid");
      const me = await fetch("/api/vault/me", { cache: "no-store" });
      if (me.status === 404) return setState("novault");
      setOffer((await res.json()) as Offer);
      setState("ready");
    }
    void init().catch(() => setState("invalid"));
  }, [inviteId]);

  async function join() {
    if (!offer) return;
    setState("joining");
    setError(null);
    try {
      const fragment = sessionStorage.getItem(storeKey(inviteId));
      if (!fragment) throw new Error("This link is missing its key. Open the full link you were sent.");
      const me = (await (await fetch("/api/vault/me", { cache: "no-store" })).json()) as { publicKey: string };
      const grants = await openInvite(fragment, offer.grants, me.publicKey);
      const res = await fetch(`/api/invites/${inviteId}/redeem`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-invite-token": readFragment(fragment).token },
        body: JSON.stringify({ grants }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "Could not join. Try again.");
      sessionStorage.removeItem(storeKey(inviteId));
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setState("ready");
    }
  }

  return (
    <AuthStage>
      <Pane title="Invitation" className="mora-frame-corners w-full max-w-md">
      <div className="grid gap-4">
        {(state === "ready" || state === "joining") && <h1 className="text-lg text-bone">{`Join ${offer?.orgName}`}</h1>}
        {state === "loading" && <p className="text-bone-faint">Checking the invite...</p>}
        {state === "signin" && (
          <>
            <p className="text-bone-faint">Sign in to accept. Afterwards, open this same link again in this tab and it will pick up where you left off.</p>
            <Button render={<Link href="/sign-in" />}>Sign in</Button>
          </>
        )}
        {state === "novault" && (
          <>
            <p className="text-bone-faint">Create your vault first, then open this link again in this tab.</p>
            <Button render={<Link href="/vault/new" />}>Create vault</Button>
          </>
        )}
        {state === "invalid" && (
          <Alert variant="destructive">
            <AlertDescription>This invite is not valid. It may have expired, been used, been revoked, or be meant for another account.</AlertDescription>
          </Alert>
        )}
        {(state === "ready" || state === "joining") && (
          <>
            <p className="text-bone-faint">
              You will get read access to {offer?.grants.length} environment{offer?.grants.length === 1 ? "" : "s"}. The keys are opened in this browser; the server never sees them.
            </p>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button onClick={() => void join()} disabled={state === "joining"}>
              {state === "joining" ? "Joining" : "Join organisation"}
            </Button>
          </>
        )}
      </div>
      </Pane>
    </AuthStage>
  );
}
