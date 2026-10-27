import Link from "next/link";
import { Article, C, Callout, H2, P, Step, Steps, UL } from "@/components/docs/prose";
import { docMeta } from "@/lib/docs";

export const metadata = docMeta("getting-started");

export default function GettingStarted() {
  return (
    <Article title="Getting started" lead="About five minutes from nothing to a secret you can read on another device.">
      <Steps>
        <Step title="Sign in">
          Choose GitHub or Google on the <Link href="/sign-in" className="text-bone underline underline-offset-4">sign-in page</Link>. That proves to
          the server who you are, and nothing more. If you use both with the same verified email they become one account.
        </Step>
        <Step title="Choose a vault passphrase">
          At least 12 characters. Four random words works well. Your browser turns it into a key that locks your private key, and the locked copy is
          what the server stores. The meter helps you pick, and the passphrase is never sent anywhere.
        </Step>
        <Step title="Save the recovery key">
          It is shown once. Put it in a password manager or print it. Then type its last four characters to confirm you saved it. If you forget the
          passphrase, this key is how you get back in.
        </Step>
        <Step title="Start in your personal workspace">
          You land in an organisation called <C>Personal</C> with a project and a <C>dev</C> environment already made, each with its own key.
        </Step>
        <Step title="Add a secret">
          Open the environment and choose <C>Add secret</C>. Give it a name such as <C>DATABASE_URL</C> and a value. It is encrypted before it is sent.
        </Step>
      </Steps>

      <Callout tone="warn" title="Lose both, lose the data">
        If you lose the passphrase and the recovery key, nobody can recover a personal vault for you, including us. Save the recovery key before
        anything else.
      </Callout>

      <H2>Bring in an existing .env</H2>
      <P>
        In an environment, choose the import button and paste or upload a <C>.env</C>. Your browser reads it, shows you what it found, and seals each
        entry as its own secret. Nothing is parsed on the server.
      </P>

      <H2>Use it on another device</H2>
      <UL>
        <li>Sign in the same way, then enter your passphrase. The key unlocks in that browser only.</li>
        <li>
          Forgot the passphrase? Choose the recovery option on the unlock screen and enter your recovery key. You will set a new passphrase.
        </li>
        <li>The lock is per browser. Signing out locks it, and so does being idle (15 minutes by default).</li>
      </UL>

      <H2>Take the tour</H2>
      <P>
        New accounts get a short guided tour of the app. You can start it again any time from the command palette: press <C>Ctrl</C> + <C>K</C> and
        choose <C>Take the tour</C>.
      </P>
    </Article>
  );
}
