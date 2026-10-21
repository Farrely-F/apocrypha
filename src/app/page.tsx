import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ShellHeader } from "@/components/shell";
import { HeroTerminal } from "@/components/landing/hero-terminal";
import { SealDemo } from "@/components/landing/seal-demo";

const REPO = "https://github.com/Farrely-F/apocrypha";

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
];

const design = [
  [
    "Sign in",
    "GitHub, Google or an email link. That proves to the server who you are, and nothing more.",
  ],
  [
    "Make a vault",
    "Choose a passphrase. Your browser turns it into a key that locks your private key, and hands you a recovery key once. Save it.",
  ],
  [
    "One key per environment",
    "dev, staging and prod each have their own key, and only people you grant can read it. A role is enforced by the cryptography, not only by a check on our server.",
  ],
  [
    "Invite by link",
    "The key for a new teammate travels after the # in the link. Browsers never send that part to us.",
  ],
] as const;

const limits = [
  [
    "Unaudited.",
    "The crypto has tests and published vectors but no independent review yet. Don't store anything you can't rotate.",
  ],
  [
    "We serve the code that decrypts.",
    "A compromised server could ship a page that steals your passphrase. A strict CSP and open source shrink that risk. They don't remove it.",
  ],
  [
    "Removing someone doesn't make them forget.",
    "Rotate the secrets themselves at their source. We'll list which ones the person could read.",
  ],
  [
    "Lose the passphrase and the recovery key, lose the data.",
    "Nobody can recover a personal vault for you, including us.",
  ],
] as const;

const wrap = "mx-auto w-full max-w-[96rem] px-6 sm:px-10";

export default function Landing() {
  return (
    <>
      <ShellHeader
        actions={
          <>
            <a
              href={REPO}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Source
            </a>
            <Link
              href="/sign-in"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Sign in
            </Link>
          </>
        }
      />

      <main className="flex-1">
        <section className="relative isolate min-h-[calc(100svh-3rem)] overflow-hidden border-b border-hairline">
          <HeroTerminal />
          {/* Behind the text column only, so the glyph field stays bright on the right. */}
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 z-[1] w-[60%] bg-gradient-to-r from-background via-background/70 to-transparent"
          />

          <div
            className={`${wrap} relative z-10 grid items-start gap-12 pt-[12svh] pb-[14svh] lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]`}
          >
            <div>
              <h1 className="font-display text-[clamp(4.5rem,12vw,10.5rem)] leading-[0.88] text-bone">
                Apocrypha
              </h1>
              <p className="mt-7 max-w-[36ch] text-2xl leading-snug text-bone">
                Your .env files, sealed in your browser before they leave it.
              </p>
              <p className="mt-4 max-w-[56ch] text-bone-dim">
                Keep the environment variables for every project in one place,
                share them with the people in your org, and pick them up on any
                machine. Our server stores ciphertext and can&apos;t read it.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href="/sign-in"
                  className={buttonVariants({ size: "lg" })}
                >
                  Sign in with GitHub
                </Link>
                <a
                  href={REPO}
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  Read the source
                </a>
              </div>
              <p className="mt-5 text-xs text-bone-faint">
                Early development. The crypto is unaudited.
              </p>
            </div>
            <div className="lg:mt-[4svh]">
              <SealDemo />
            </div>
          </div>
        </section>

        <section className={`${wrap} py-24`}>
          <h2 className="font-display text-4xl text-bone">
            What the server holds
          </h2>
          <p className="mt-3 max-w-[62ch] text-bone-dim">
            The same three secrets, as you see them and as we store them. Names
            are sealed along with the values.
          </p>

          <div className="mt-10 border border-hairline">
            <div className="grid lg:grid-cols-2">
              <p className="border-b border-hairline px-5 py-3 text-bone lg:border-r">
                In your browser
              </p>
              <p className="hidden border-b border-hairline px-5 py-3 text-bone lg:block">
                On our server
              </p>
            </div>
            {ledger.map((row, i) => (
              <div
                key={row.name}
                className={`grid lg:grid-cols-2 ${i > 0 ? "border-t border-hairline-faint" : ""}`}
              >
                <p className="break-all px-5 py-4 lg:border-r lg:border-hairline">
                  <span className="text-bone-dim">{row.name}</span>
                  <span className="text-bone-faint">=</span>
                  <span className="text-bone">{row.value}</span>
                </p>
                <div className="break-all border-t border-hairline-faint px-5 py-4 text-signal lg:border-t-0">
                  <span className="mb-1 block text-xs text-bone-faint lg:hidden">
                    On our server
                  </span>
                  <p>{row.sealedName}</p>
                  <p className="text-signal-dim">{row.sealedValue}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-6 max-w-[80ch] text-bone-dim">
            Stored in the clear: the names of your orgs, projects and
            environments, who belongs to each org and in what role, when each
            change happened and who made it, and how many secrets an
            environment holds. Never stored: your passphrase or your private
            key.
          </p>
        </section>

        <section className="border-t border-hairline">
          <div
            className={`${wrap} grid gap-10 py-20 lg:grid-cols-[20rem_minmax(0,1fr)]`}
          >
            <h2 className="font-display text-4xl text-bone lg:sticky lg:top-8 lg:self-start">
              The design
            </h2>
            <dl className="grid gap-x-14 gap-y-8 md:grid-cols-2">
              {design.map(([term, text]) => (
                <div key={term}>
                  <dt className="text-bone">{term}</dt>
                  <dd className="mt-1 max-w-[52ch] text-bone-dim">{text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-hairline">
          <div
            className={`${wrap} grid gap-10 py-20 lg:grid-cols-[20rem_minmax(0,1fr)]`}
          >
            <h2 className="font-display text-4xl text-bone lg:sticky lg:top-8 lg:self-start">
              Limits, up front
            </h2>
            <dl className="grid gap-x-14 gap-y-8 md:grid-cols-2">
              {limits.map(([term, text]) => (
                <div key={term} className="flex gap-3">
                  <span aria-hidden className="text-blood-bright">
                    !
                  </span>
                  <div>
                    <dt className="text-bone">{term}</dt>
                    <dd className="mt-1 max-w-[52ch] text-bone-dim">{text}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="relative h-40 overflow-hidden border-t border-hairline">
        <div
          className={`${wrap} relative z-10 flex h-full flex-col justify-end gap-2 py-5 text-xs text-bone-faint`}
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
