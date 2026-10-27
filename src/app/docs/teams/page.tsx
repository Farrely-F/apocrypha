import Link from "next/link";
import { Article, C, Callout, H2, P, Step, Steps, Terms, UL } from "@/components/docs/prose";
import { docMeta } from "@/lib/docs";

export const metadata = docMeta("teams");

export default function Teams() {
  return (
    <Article title="Teams and access" lead="Roles say what someone may do. Environment access says which keys they hold.">
      <H2>Roles</H2>
      <Terms
        items={[
          ["Owner", "Runs the organisation. Can do everything, makes other owners, and can never be removed by anyone else."],
          ["Admin", "Builds projects and environments, invites people, manages each member's access and removes members. Cannot change roles."],
          ["Member", "Works in the environments they are given: read, and write where an admin allows it."],
        ]}
      />
      <P>
        The full table is in <C>Organisation settings</C>, under permissions. It is drawn from the same lists the server checks.
      </P>

      <H2>Access per environment</H2>
      <UL>
        <li>
          <strong className="text-bone">Read</strong> means holding the environment&apos;s key. That is cryptographic: without it, the data is noise.
        </li>
        <li>
          <strong className="text-bone">Write</strong> adds permission to change secrets, so a plain member can write in chosen environments without
          becoming an admin.
        </li>
        <li>
          <strong className="text-bone">None</strong> means no key. You can only give what you can read yourself.
        </li>
        <li>Open a member&apos;s access from the members list to set it per environment.</li>
      </UL>

      <H2>Invite someone</H2>
      <Steps>
        <Step title="Create an invite">
          From the organisation menu choose invite, pick the environments they should read, and optionally tie it to one email address. They join as
          a member; you can give them write access, or change their role, afterwards.
        </Step>
        <Step title="Send the link">
          The key they need travels after the <C>#</C> in the link, which browsers never send to us. The link works once and for 48 hours.
        </Step>
        <Step title="They join">
          They sign in, open the link, and make a vault if they do not have one. The environments you chose appear for them, read-only until you allow writing.
        </Step>
      </Steps>

      <H2>Remove someone</H2>
      <P>
        Removing a member, or taking an environment away from them, cuts their access to that environment&apos;s key. The environment gets a fresh key
        version, wrapped to the people who remain, and new writes use it. Older versions stay readable for those who still have access.
      </P>
      <Callout tone="warn" title="They keep what they already saw">
        Someone who read a secret still knows it. The confirmation lists the secrets they could read: rotate those at their source (the database
        password, the API key), not just here.
      </Callout>
      <P>
        Removal needs an unlocked admin, because the new key is wrapped in the admin&apos;s browser. Changing someone from write to read does not rotate anything.
      </P>

      <H2>If a member forgets everything</H2>
      <P>
        If someone loses both their passphrase and recovery key, they can reset their vault to a fresh key. An owner or admin then re-shares the
        environments they belonged to. Anything stored only in their personal vault is gone.
      </P>

      <H2>The record</H2>
      <P>
        The organisation keeps an audit log of who changed what and when, as a chain of hashes so an entry cannot be altered quietly. Owners and admins see
        everything; members see events about themselves and the environments they can open. It stores ids, never names or secret values.
      </P>
      <P>
        See also <Link href="/docs/security" className="text-bone underline underline-offset-4">Security and privacy</Link>.
      </P>
    </Article>
  );
}
