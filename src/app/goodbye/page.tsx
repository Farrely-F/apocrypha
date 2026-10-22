import Link from "next/link";
import { AuthStage, Pane } from "@/components/shell";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Account erased" };

/** Where someone lands after erasing their account: public, static, and says what happened. */
export default function GoodbyePage() {
  return (
    <AuthStage>
      <div className="w-full max-w-md">
        <Pane title="Account erased" className="mora-frame-corners bg-background">
          <p className="text-bone-dim">
            Your account, vault and the personal data tied to them have been erased, and you are signed out. The key is gone from this
            browser; a browser you left unlocked elsewhere holds a key that no longer opens anything.
          </p>
          <p className="mt-3 text-xs text-bone-faint">Signing in again later creates a new, empty account.</p>
          <div className="mt-6">
            <Button nativeButton={false} render={<Link href="/" />}>Back to the start</Button>
          </div>
        </Pane>
      </div>
    </AuthStage>
  );
}
