export type Box = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

/**
 * Where the tour card goes. Centred on the target and below it; above when
 * there is no room below; pinned to the bottom edge when the target is too
 * tall for either. With no target the card sits in the middle of the screen.
 */
export function placeCard(
  target: Box | null,
  card: Size,
  view: Size,
  { gap = 14, margin = 16 }: { gap?: number; margin?: number } = {},
): { left: number; top: number } {
  if (!target) {
    return { left: (view.w - card.w) / 2, top: Math.max(margin, (view.h - card.h) / 2) };
  }
  const left = clamp(target.x + target.w / 2 - card.w / 2, margin, view.w - card.w - margin);
  const below = target.y + target.h + gap;
  if (below + card.h <= view.h - margin) return { left, top: below };
  const above = target.y - gap - card.h;
  if (above >= margin) return { left, top: above };
  return { left, top: clamp(view.h - card.h - margin, margin, view.h) };
}

/** On a phone the card docks to the edge farthest from the target. */
export function dockEdge(target: Box | null, viewH: number): "top" | "bottom" {
  if (!target) return "bottom";
  return target.y + target.h / 2 < viewH / 2 ? "bottom" : "top";
}
