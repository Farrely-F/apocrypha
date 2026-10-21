import type { Metadata } from "next";
import { preload } from "react-dom";
import { Divider } from "@/components/shell";
import { LandingHeader } from "@/components/landing/landing-header";
import { Hero } from "@/components/landing/hero";
import { ServerLedger } from "@/components/landing/server-ledger";
import { DesignChapter } from "@/components/landing/design-chapter";
import { Limits } from "@/components/landing/limits";
import { Unlock } from "@/components/landing/unlock";
import { SITE } from "@/lib/seo";

const REPO = "https://github.com/Farrely-F/apocrypha";

// The one indexable page. Every other route inherits noindex from the root layout.
export const metadata: Metadata = {
  title: { absolute: SITE.title },
  description: SITE.description,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: SITE.description,
  },
};

// What the ledger shows. Values are fake samples; ciphertext is static so the
// page renders the same on server and client.
const ledger = [
  {
    name: "DATABASE_URL",
    value: "postgres://app:hunter2@db.internal/prod",
    sealedName: "v1|a256gcm|Qm9Kc2xhYmVsVnU3",
    sealedValue: "v1|a256gcm|7fT0xk2LwQ-aP9dRz1Vn",
  },
  {
    name: "STRIPE_SECRET_KEY",
    value: "sk_live_example_not_a_real_key",
    sealedName: "v1|a256gcm|H3dsYzQ0eHBvcnRfZ2",
    sealedValue: "v1|a256gcm|c0Gm4Jb8Yw_u2NhK6tSe",
  },
  {
    name: "SENTRY_DSN",
    value: "https://abc123@o0.ingest.sentry.io/1",
    sealedName: "v1|a256gcm|Zk5hdHRlcnNlbnRyeQ",
    sealedValue: "v1|a256gcm|Rr1pXo7Vd3-LqA0yT8uC",
  },
] as const;

const design = [
  {
    term: "Sign in",
    pane: "Identity",
    text: "GitHub, Google or an email link. That proves to the server who you are, and nothing more.",
  },
  {
    term: "Make a vault",
    pane: "Vault",
    text: "Choose a passphrase. Your browser turns it into a key that locks your private key, and hands you a recovery key once. Save it.",
  },
  {
    term: "One key per environment",
    pane: "Keys",
    text: "dev, staging and prod each have their own key, and only people you grant can read it. A role is enforced by the cryptography, not only by a check on our server.",
  },
  {
    term: "Invite by link",
    pane: "Invite",
    text: "The key for a new teammate travels after the # in the link. Browsers never send that part to us.",
  },
] as const;

const limits = [
  {
    term: "Unaudited.",
    text: "The crypto has tests and published vectors but no independent review yet. Don't store anything you can't rotate.",
  },
  {
    term: "We serve the code that decrypts.",
    text: "A compromised server could ship a page that steals your passphrase. A strict CSP and open source shrink that risk. They don't remove it.",
  },
  {
    term: "Removing someone doesn't make them forget.",
    text: "Rotate the secrets themselves at their source. We'll list which ones the person could read.",
  },
  {
    term: "Lose the passphrase and the recovery key, lose the data.",
    text: "Nobody can recover a personal vault for you, including us.",
  },
] as const;

const wrap = "mx-auto w-full max-w-[96rem] px-6 sm:px-10";

export default function Landing() {
  // The painting is the largest thing above the fold; start fetching it with the HTML.
  preload("/brand/hero-library.webp", { as: "image", type: "image/webp" });

  return (
    <>
      <script
        type="application/ld+json"
        // Static, authored JSON. Never interpolate user input here.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE.jsonLd) }}
      />
      <LandingHeader repo={REPO} />

      <main className="flex-1">
        <Hero repo={REPO} />

        <ServerLedger rows={ledger} />

        <section className={`${wrap} pb-24`}>
          <p className="max-w-[80ch] text-bone-dim">
            Stored in the clear: the names of your orgs, projects and
            environments, who belongs to each org and in what role, when each
            change happened and who made it, and how many secrets an
            environment holds. Never stored: your passphrase or your private
            key.
          </p>
        </section>

        <div className={wrap}>
          <div className="mora-rule-diamond" role="separator" />
        </div>

        <DesignChapter steps={design} />

        <div className={wrap}>
          <Divider label="before you decide" weight="double" ends />
        </div>

        <Limits limits={limits} />

        <Unlock repo={REPO} />
      </main>

      <footer className="relative isolate overflow-hidden border-t border-hairline">
        <div
          aria-hidden
          className="mora-tex-stacks-painted absolute inset-0 z-0 opacity-80 [mask-image:linear-gradient(to_bottom,transparent,#000_70%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 z-[1] bg-gradient-to-b from-background/30 via-background/65 to-background"
        />
        <div
          className={`${wrap} relative z-10 flex flex-col justify-end gap-2 pt-24 pb-6 text-xs text-bone-faint`}
        >
          <span>Open source. Unaudited.</span>
          <a
            href={REPO}
            className="w-fit text-bone-dim underline underline-offset-4 hover:text-signal"
          >
            github.com/Farrely-F/apocrypha
          </a>
        </div>
      </footer>
    </>
  );
}
