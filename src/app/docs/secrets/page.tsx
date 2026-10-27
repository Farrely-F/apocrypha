import { Article, C, Callout, H2, P, UL } from "@/components/docs/prose";
import { docMeta } from "@/lib/docs";

export const metadata = docMeta("secrets");

export default function Secrets() {
  return (
    <Article title="Working with secrets" lead="Names and values are sealed in your browser. The server only ever stores ciphertext.">
      <H2>Add and edit</H2>
      <UL>
        <li>
          <C>Add secret</C> takes a name and a value. Names are sealed too, so the server does not even know what your secrets are called.
        </li>
        <li>Editing never overwrites: every change is a new version on top of the old one.</li>
        <li>Values stay hidden until you reveal them. You can copy a single value without showing it.</li>
        <li>You need write access on the environment to add or change anything. A read-only member can open and copy.</li>
      </UL>

      <H2>History and restore</H2>
      <P>
        Open a secret&apos;s history to see its versions, who changed it and when. Restoring an old version adds it as a new one, so nothing is ever lost.
        If two people edit the same secret at once, the second save is stopped and shown the newer version so you can decide what to keep.
      </P>

      <H2>Import and export</H2>
      <UL>
        <li>
          <strong className="text-bone">Import:</strong> paste or upload a <C>.env</C>, and choose whether names that already exist are overwritten. The import is all or nothing.
        </li>
        <li>
          <strong className="text-bone">Export:</strong> download the environment as <C>.env</C> or JSON while you are unlocked. The file is made in
          your browser.
        </li>
      </UL>
      <Callout tone="warn" title="Exports are plain text">
        A downloaded file is no longer protected by your vault. Treat it like the secret it holds and delete it when you are done.
      </Callout>

      <H2>Share a snapshot with someone outside</H2>
      <P>
        Owners and admins can make a <strong className="text-bone">share link</strong> for a guest who has no account. It carries a sealed snapshot of
        selected secrets; the key to open it travels after the <C>#</C> in the link, which browsers never send to us.
      </P>
      <UL>
        <li>By default a link works for one view and expires after 24 hours. You can change both, or add a password.</li>
        <li>Without a password, the link is the key: anyone who gets the whole link can read what it holds.</li>
        <li>You can revoke a link at any time, and finished links can be cleared.</li>
        <li>A share is a copy. Changing the secret later does not change what the link shows.</li>
      </UL>

      <H2>Find things</H2>
      <P>
        Each environment has a search box that matches secret names in your browser, and a sort control. To jump between environments, use the command
        palette: <C>Ctrl</C> + <C>K</C>.
      </P>
    </Article>
  );
}
