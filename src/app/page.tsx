import type { Metadata } from "next";
import { preload } from "react-dom";
import { Divider } from "@/components/shell";
import { LandingHeader } from "@/components/landing/landing-header";
import { PageGround } from "@/components/landing/page-ground";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Hero } from "@/components/landing/hero";
import { ServerLedger } from "@/components/landing/server-ledger";
import { HowItWorks } from "@/components/landing/how-it-works";
import { DesignChapter } from "@/components/landing/design-chapter";
import { Limits } from "@/components/landing/limits";
import { Faq } from "@/components/landing/faq";
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

const faq = [
  {
    q: "What can the server see?",
    a: "Ciphertext, and the structure around it: the names of your orgs, projects and environments, who belongs to each org and in what role, when each change happened and who made it, and how many secrets an environment holds. It never sees a secret's name or value, your passphrase, or your private key.",
  },
  {
    q: "Why a passphrase when I already sign in with GitHub or Google?",
    a: "Signing in proves to the server who you are. The passphrase is a separate secret that never leaves your browser: it unlocks the private key that opens your environments. That split is why a leaked session can't read your secrets.",
  },
  {
    q: "What if I forget my passphrase?",
    a: "Use the recovery key you were shown once when you made the vault. If you've lost both, an admin of your org can reset you to a fresh key and re-share the environments you belonged to. Anything stored only in your personal vault is gone for good, and nobody can recover it for you, including us.",
  },
  {
    q: "How do I get my .env in and out?",
    a: "Paste or upload a .env and your browser parses it, sealing each entry as its own version. Export as .env or JSON, or copy a single value, any time you're unlocked.",
  },
  {
    q: "How does a teammate get access?",
    a: "Send them an invite link. The key they need travels after the # in the link, which browsers never send to us, and the invite works once, for 48 hours. You choose which environments they can read or write, and you can only share ones you can read yourself.",
  },
  {
    q: "What happens when I remove someone?",
    a: "Their access to that environment's key is cut and new writes use a fresh key. They keep whatever they already saw, though, so rotate those secrets at their source. We list which ones the person could read.",
  },
  {
    q: "Can I run it myself?",
    a: "Yes. It's a Next.js app and a Postgres database with a Docker setup, and the same encryption applies: the server you run still only holds ciphertext. The self-hosting guide in the repo covers configuration, backups and upgrades.",
  },
  {
    q: "Is it safe for production secrets yet?",
    a: "Not yet. The crypto has tests and published vectors but no independent review. Until there is one, keep to secrets you can rotate.",
  },
] as const;

const wrap = "mx-auto w-full max-w-[96rem] px-6 sm:px-10";

export default function Landing() {
  // The painting is the largest thing above the fold; start fetching it with the HTML.
  preload("/brand/hero-library.webp", { as: "image", type: "image/webp" });

  return (
    <div className="relative isolate">
      <PageGround />
      <script
        type="application/ld+json"
        // Static, authored JSON. Never interpolate user input here.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE.jsonLd) }}
      />
      <script
        type="application/ld+json"
        // Static, authored JSON built from the same list the page renders.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />
      <LandingHeader repo={REPO} />

      <main className="relative z-10 flex-1">
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

        <HowItWorks sample={ledger[0]} />

        <div className={wrap}>
          <div className="mora-rule-diamond" role="separator" />
        </div>

        <DesignChapter steps={design} />

        <div className={wrap}>
          <Divider label="before you decide" weight="double" ends />
        </div>

        <Limits limits={limits} />

        <Faq questions={faq} repo={REPO} />
      </main>

      <LandingFooter repo={REPO} />
    </div>
  );
}
