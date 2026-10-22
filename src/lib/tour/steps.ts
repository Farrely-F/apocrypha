/** One stop on the tour. A step without a target is a centred card. */
export type TourStep = {
  id: string;
  /** `data-tour` values to anchor on, in order of preference. */
  target?: readonly string[];
  title: string;
  body: string;
};

/** Something on the page a step could point at, with its measured size. */
export type Anchor<T> = { el: T; width: number; height: number };

/** The first anchor that is actually on screen (hidden elements measure 0). */
export function pickAnchor<T>(candidates: readonly Anchor<T>[]): T | null {
  return candidates.find((c) => c.width > 0 && c.height > 0)?.el ?? null;
}

/**
 * Which steps can be shown right now. `find` answers whether a `data-tour`
 * value has a visible element, so steps for things this account cannot see
 * (no write access, the org menu on a phone) drop out instead of pointing at
 * nothing.
 */
export function activeSteps(steps: readonly TourStep[], find: (target: string) => boolean): TourStep[] {
  return steps.filter((s) => !s.target || s.target.some(find));
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    title: "Your vault is open",
    body: "Everything you add here is encrypted in this browser before it leaves it. A short look around, about a minute.",
  },
  {
    id: "workspace",
    target: ["workspace"],
    title: "Where you are",
    body: "Organisation, project, environment: dev, staging and prod each have their own key. Open any of them to switch or make a new one.",
  },
  {
    id: "add",
    target: ["add"],
    title: "Put secrets in",
    body: "Add one by name and value, or import a whole .env with the upload icon beside it. Names and values are sealed separately.",
  },
  {
    id: "registry",
    target: ["registry"],
    title: "The registry",
    body: "Your secrets are listed here, values masked until you reveal them. A row's menu edits a secret or opens its full history: every version and who wrote it.",
  },
  {
    id: "share",
    target: ["share"],
    title: "Hand one over",
    body: "Once there are secrets here, this makes a link that carries the key to open them, so anyone holding it can read them. Send it somewhere private and let it expire.",
  },
  {
    id: "org",
    target: ["org"],
    title: "People and the record",
    body: "The organisation menu holds Members, invites for new teammates, and the audit log of who did what and when.",
  },
  {
    id: "palette",
    target: ["palette"],
    title: "Jump anywhere",
    body: "Ctrl K opens the palette: any environment, any project, or an action like locking the vault. You can replay this tour from there.",
  },
  {
    id: "lock",
    target: ["lock"],
    title: "Lock it when you leave",
    body: "Locking forgets your key in this browser. Keep the recovery key somewhere safe and offline: without it and your passphrase, nobody can open your vault. You can change the passphrase from the palette.",
  },
];
