import { Article, C, Callout, H2, P, Terms, UL } from "@/components/docs/prose";
import { docMeta } from "@/lib/docs";

export const metadata = docMeta("security");

const REPO = "https://github.com/Farrely-F/apocrypha";

export default function Security() {
  return (
    <Article title="Security and privacy" lead="What is protected, what the server can still see, and where the limits are.">
      <H2>What the server sees</H2>
      <Terms
        items={[
          ["Never", "Your passphrase, your private key, any environment key, and the name or value of any secret."],
          ["Ciphertext", "Everything sealed: secret names and values, and your private key locked by your passphrase."],
          ["In the clear", "Names, descriptions, tags and links of organisations, projects and environments; who belongs to each organisation and in what role; when changes happened and who made them; and how many secrets an environment holds."],
        ]}
      />

      <H2>How it works, briefly</H2>
      <UL>
        <li>Your passphrase is stretched with Argon2id into a key that locks your private key. Only the locked copy leaves your browser.</li>
        <li>Each environment has its own random key. It is wrapped to each person who may read it, using their public key.</li>
        <li>Secrets are encrypted with AES-256-GCM under that environment key, in your browser.</li>
      </UL>
      <P>
        The exact formats are in the <a href={`${REPO}/blob/main/docs/crypto.md`} className="text-bone underline underline-offset-4">crypto spec</a>.
      </P>

      <H2>Locking</H2>
      <UL>
        <li>After you unlock, the key is held in your browser as a non-extractable key, so scripts can use it but cannot read it out.</li>
        <li>It locks after 15 minutes without activity, and signing out locks it too.</li>
        <li>
          <C>Trust this device</C> skips the idle lock for up to 7 days. Use it only on a device that is yours.
        </li>
        <li>
          Some older iPhone and Safari builds cannot store the key. There the vault stays unlocked in that tab only, and a reload locks it.
        </li>
      </UL>

      <H2>Your account</H2>
      <UL>
        <li>
          <strong className="text-bone">Two-step sign-in:</strong> turn on an authenticator app in Settings. It protects sign-in; it does not change how
          the vault is encrypted.
        </li>
        <li>
          <strong className="text-bone">Sessions:</strong> Settings lists where you are signed in and lets you sign out of one place or all others.
        </li>
        <li>
          <strong className="text-bone">Your data:</strong> export what the service holds about you, or erase your account. Organisations you are the only
          member of are deleted with you. The rest keep their data, with your id left as an opaque reference.
        </li>
      </UL>

      <H2>Limits you should know</H2>
      <Callout tone="warn" title="Not independently audited">
        The crypto is checked against published test vectors and has had a review by an AI assistant, which is not an outside audit. Don&apos;t store
        anything you can&apos;t rotate.
      </Callout>
      <UL>
        <li>We serve the code that decrypts. A compromised server could ship a page that steals your passphrase. A strict content security policy and open source shrink that risk; they do not remove it.</li>
        <li>Removing someone does not make them forget. Rotate the secret at its source.</li>
        <li>Secret lengths, counts and timing are visible to the server.</li>
        <li>Lose the passphrase and the recovery key and the data is gone.</li>
      </UL>
      <P>
        More detail: <a href={`${REPO}/blob/main/docs/SECURITY.md`} className="text-bone underline underline-offset-4">SECURITY.md</a>,{" "}
        <a href={`${REPO}/blob/main/docs/PRIVACY.md`} className="text-bone underline underline-offset-4">PRIVACY.md</a> and the{" "}
        <a href={`${REPO}/blob/main/docs/crypto-review.md`} className="text-bone underline underline-offset-4">crypto review</a>.
      </P>
    </Article>
  );
}
