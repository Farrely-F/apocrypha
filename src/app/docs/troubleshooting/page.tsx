import { Article, C, H2, P, UL } from "@/components/docs/prose";
import { docMeta } from "@/lib/docs";

export const metadata = docMeta("troubleshooting");

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <H2>{q}</H2>
      {children}
    </section>
  );
}

export default function Troubleshooting() {
  return (
    <Article title="Troubleshooting" lead="The snags people hit most, and what to do about each.">
      <Q q="The passphrase looks wrong on a new device">
        <P>Check which message you get.</P>
        <UL>
          <li>
            <strong className="text-bone">&quot;Incorrect passphrase&quot;:</strong> it is the wrong one, or you are signed in to a different account than
            the one that made the vault. Try the recovery key.
          </li>
          <li>
            <strong className="text-bone">&quot;Your passphrase is right, but this browser cannot load your vault key&quot;:</strong> the browser is too old for
            the key type. Update it, or unlock from another browser. Recent Chrome, Firefox and Safari 17 or newer work, and older iPhones fall back to a
            tab-only unlock.
          </li>
          <li>
            <strong className="text-bone">&quot;Not a secure context&quot;:</strong> open the site over <C>https</C> (or <C>localhost</C>). Browsers switch off the
            cryptography on plain http.
          </li>
          <li>
            <strong className="text-bone">Memory message:</strong> the passphrase check needs about 64 MB free. Close other tabs and try again.
          </li>
        </UL>
      </Q>

      <Q q="I forgot my passphrase">
        <P>
          Use <C>Recovery key</C> on the unlock screen and set a new passphrase. With neither, an owner or admin can reset you to a new key and re-share
          your environments, but whatever lived only in your personal vault is gone.
        </P>
      </Q>

      <Q q="The vault locked by itself">
        <P>
          It locks after 15 minutes without activity, when you sign out, or when you lock it in another tab (that locks all of them). On some iPhones the
          key lives in the tab only, so a reload locks it.
        </P>
      </Q>

      <Q q="I cannot see an environment or project">
        <P>
          You only see environments whose key was shared with you, and a project with none you can open is hidden. Ask an owner or admin for access from the
          members list.
        </P>
      </Q>

      <Q q="I cannot add or change a secret">
        <P>
          Your role can read this environment but not write. An owner or admin can give you write access on it.
        </P>
      </Q>

      <Q q="An invite link does not work">
        <P>
          Invites work once and expire after 48 hours. If it was tied to one email, sign in with that address. Ask for a fresh link if it has been used.
        </P>
      </Q>

      <Q q="Too many attempts">
        <P>
          Sign-in and code entry are rate limited, and repeated wrong codes lock that account for 15 minutes. Wait, then try again.
        </P>
      </Q>

      <Q q="Something else">
        <P>
          Search the open issues or file one on the{" "}
          <a href="https://github.com/Farrely-F/apocrypha/issues" className="text-bone underline underline-offset-4">
            repository
          </a>
          . Please leave secrets and passphrases out of what you post.
        </P>
      </Q>
    </Article>
  );
}
