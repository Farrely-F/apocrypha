"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ENV_KINDS, KIND_LABEL, MAX_TAG, MAX_TAGS, normalizeTag, type EnvKind } from "@/lib/workspace/meta";

const KIND_ITEMS = ENV_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }));

/** dev / staging / prod / other, as a shadcn select. */
export function KindSelect({
  value,
  onChange,
  id,
  className,
}: {
  value: EnvKind;
  onChange: (kind: EnvKind) => void;
  id?: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as EnvKind)} items={KIND_ITEMS}>
      <SelectTrigger id={id} aria-label="Environment type" className={className ?? "w-full"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {KIND_ITEMS.map((k) => (
          <SelectItem key={k.value} value={k.value}>
            {k.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Tags as chips in front of a text box. Enter or a comma adds what is typed, Backspace on an empty
 * box removes the last one. `suggestions` are tags already used in the organisation, one click each.
 */
export function TagInput({
  value,
  onChange,
  id,
  invalid,
  suggestions = [],
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  id?: string;
  invalid?: boolean;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState("");
  const full = value.length >= MAX_TAGS;

  function add(raw: string) {
    const tag = normalizeTag(raw);
    setDraft("");
    if (tag && !value.includes(tag) && value.length < MAX_TAGS) onChange([...value, tag]);
  }

  const offered = suggestions.filter((t) => !value.includes(t)).slice(0, 8);

  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
          {value.map((t) => (
            <li key={t} className="inline-flex items-center border border-hairline-faint bg-pane/40 text-[0.72rem] text-bone-dim">
              <span className="px-1.5 py-0.5">{t}</span>
              <button
                type="button"
                aria-label={`Remove tag ${t}`}
                onClick={() => onChange(value.filter((x) => x !== t))}
                className="flex size-5 items-center justify-center text-bone-faint transition-colors hover:text-blood-bright"
              >
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        value={draft}
        disabled={full}
        maxLength={MAX_TAG + 8}
        aria-invalid={invalid}
        placeholder={full ? `Up to ${MAX_TAGS} tags` : "Type a tag, press Enter"}
        autoComplete="off"
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) {
            for (const part of v.split(",")) add(part);
          } else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
      />
      {!full && offered.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[0.7rem] text-bone-faint">In use:</span>
          {offered.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => add(t)}
              className="inline-flex items-center gap-1 border border-dashed border-hairline-faint px-1.5 py-0.5 text-[0.72rem] text-bone-faint transition-colors hover:border-signal-dim hover:text-signal"
            >
              <Plus aria-hidden className="size-3" />
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
