import { BookOpen, GitBranch } from "lucide-react";
import { KIND_LABEL, type EnvKind } from "@/lib/workspace/meta";
import { cn } from "@/lib/utils";

const KIND_STYLE: Record<EnvKind, string> = {
  prod: "border-blood/70 text-blood-bright",
  staging: "border-lamp-dim/70 text-lamp",
  dev: "border-signal-dim/70 text-signal",
  other: "border-hairline-faint text-bone-dim",
};

/** Which kind of environment this is. Prod is loud on purpose: it is the one to be careful in. */
export function KindBadge({ kind, className }: { kind: EnvKind; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center border px-1.5 py-0.5 text-[0.64rem] uppercase tracking-[0.14em]", KIND_STYLE[kind], className)}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

/** An environment in a list: its name, edged in the colour of its type. */
export function EnvChip({ name, kind }: { name: string; kind: EnvKind }) {
  return (
    <span
      title={KIND_LABEL[kind]}
      className={cn("border px-1.5 py-0.5 text-[0.64rem] uppercase tracking-[0.14em]", kind === "other" ? "border-hairline-faint text-bone-dim" : KIND_STYLE[kind])}
    >
      {name}
    </span>
  );
}

const chip = "inline-flex items-center border border-hairline-faint bg-pane/40 px-1.5 py-0.5 text-[0.72rem] text-bone-dim";

/** Tags as quiet chips. With `onSelect` they are toggles for filtering. */
export function TagChips({
  tags,
  active,
  onSelect,
  max,
  className,
}: {
  tags: string[];
  active?: ReadonlySet<string>;
  onSelect?: (tag: string) => void;
  /** Show at most this many, then "+N" (the rest are in its tooltip). Picked tags always show. */
  max?: number;
  className?: string;
}) {
  if (tags.length === 0) return null;
  const shown = max === undefined || tags.length <= max ? tags : [...tags.slice(0, max), ...tags.slice(max).filter((t) => active?.has(t))];
  const hidden = tags.filter((t) => !shown.includes(t));
  return (
    <span className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {shown.map((t) =>
        onSelect ? (
          <button
            key={t}
            type="button"
            aria-pressed={active?.has(t) ?? false}
            onClick={() => onSelect(t)}
            className={cn(chip, "transition-colors hover:border-signal-dim hover:text-signal aria-pressed:border-signal-dim aria-pressed:text-signal")}
          >
            {t}
          </button>
        ) : (
          <span key={t} className={chip}>
            {t}
          </span>
        ),
      )}
      {hidden.length > 0 && (
        <span title={hidden.join(", ")} className="px-1 text-[0.72rem] text-bone-faint">
          +{hidden.length}
        </span>
      )}
    </span>
  );
}

/** Repository and docs links. Stored links are https-only; they open in a new tab without a referrer. */
export function ProjectLinks({ repoUrl, docsUrl, className }: { repoUrl: string | null; docsUrl: string | null; className?: string }) {
  if (!repoUrl && !docsUrl) return null;
  const link = "inline-flex items-center gap-1.5 text-bone-dim underline-offset-4 transition-colors hover:text-signal hover:underline";
  return (
    <span className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-sm", className)}>
      {repoUrl && (
        <a href={repoUrl} target="_blank" rel="noopener noreferrer" className={link}>
          <GitBranch aria-hidden className="size-3.5" />
          Repository
        </a>
      )}
      {docsUrl && (
        <a href={docsUrl} target="_blank" rel="noopener noreferrer" className={link}>
          <BookOpen aria-hidden className="size-3.5" />
          Docs
        </a>
      )}
    </span>
  );
}
