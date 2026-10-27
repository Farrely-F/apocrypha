import { Article, C, Callout, H2, P, UL } from "@/components/docs/prose";
import { docMeta } from "@/lib/docs";

export const metadata = docMeta("self-hosting");

const REPO = "https://github.com/Farrely-F/apocrypha";

export default function SelfHosting() {
  return (
    <Article title="Self-hosting" lead="Run it yourself. The same encryption applies: the server you run still only holds ciphertext.">
      <H2>What you need</H2>
      <UL>
        <li>Docker, or Node.js to run it directly.</li>
        <li>
          A database. Self-hosting uses a file-backed libSQL database on a volume (<C>file:./data/apocrypha.db</C>); a Turso URL also works.
        </li>
        <li>An OAuth app for GitHub or Google (at least one), since sign-in goes through them. Email sign-in is not built yet.</li>
        <li>An https address. Browsers turn off the cryptography the vault needs on plain http (localhost is fine).</li>
      </UL>

      <H2>Run it</H2>
      <P>
        The repository ships a <C>Dockerfile</C> and a <C>docker-compose.yml</C>. The container brings the database up to date on every start and refuses to
        run if a migration fails, so the app never serves a database it does not match. Settings are environment variables, such as the public URL, the
        auth secret, the database path and the OAuth credentials.
      </P>
      <Callout tone="note" title="The full guide lives in the repository">
        Configuration, the health check, online backups, restoring and upgrading are in{" "}
        <a href={`${REPO}/blob/main/docs/SELF-HOSTING.md`} className="text-bone underline underline-offset-4">
          docs/SELF-HOSTING.md
        </a>
        . Follow that for anything beyond a first run.
      </Callout>

      <H2>Backups</H2>
      <P>
        The database holds ciphertext only, but it is everyone&apos;s data, so protect backups like the live database. The image includes an online backup
        command that takes a consistent snapshot while the app runs.
      </P>

      <H2>System administrator page</H2>
      <P>
        Set <C>SYSTEM_ADMIN_EMAILS</C> to give your own account a read-only page of system health and usage totals. It shows no names, secrets or organisation
        contents, and every look at it is recorded. Leave it unset and the page does not exist.
      </P>
    </Article>
  );
}
