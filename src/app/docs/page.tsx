import Link from "next/link";
import { Article, Callout, H2, P, Terms, UL } from "@/components/docs/prose";
import { DOCS, docMeta, docPath } from "@/lib/docs";

export const metadata = docMeta("");

export default function Overview() {
  return (
    <Article
      title="Documentation"
      lead="Apocrypha keeps your .env files for every project in one place, shares them with your team, and lets you pick them up on any machine. Everything is sealed in your browser before it leaves it."
    >
      <Callout tone="warn" title="Early and unaudited">
        The cryptography has tests and published test vectors, and a review by an AI assistant, but no independent audit. Until there is one, keep to
        secrets you can rotate.
      </Callout>

      <H2>How it is organised</H2>
      <P>Everything lives in a small tree. Each level has one job.</P>
      <Terms
        items={[
          ["Organisation", "A team or just you. It holds people and their roles. You get a personal one automatically."],
          ["Project", "One application or service. It carries a description, tags and links so people know what it is."],
          ["Environment", "dev, staging, prod or anything else. Each environment has its own key, and access is decided per environment."],
          ["Secret", "A name and a value, with its full history. Both are encrypted in your browser."],
        ]}
      />

      <H2>The one idea worth knowing</H2>
      <P>
        Two secrets keep your data private: your <strong className="text-bone">passphrase</strong> and your{" "}
        <strong className="text-bone">recovery key</strong>. You make them once, in your browser. The server never sees either, so it cannot read your
        secrets and cannot reset your passphrase. That is the point, and it is also why you must save the recovery key.
      </P>
      <P>
        Signing in with GitHub or Google only proves who you are. The passphrase is separate, and it is what unlocks your vault on each new device.
      </P>

      <H2>Where to start</H2>
      <UL>
        {DOCS.slice(1).map((d) => (
          <li key={d.slug}>
            <Link href={docPath(d.slug)} className="text-bone underline decoration-hairline underline-offset-4 transition-colors hover:decoration-signal">
              {d.title}
            </Link>
            : {d.description}
          </li>
        ))}
      </UL>
    </Article>
  );
}
