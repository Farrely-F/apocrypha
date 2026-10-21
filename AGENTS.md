<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## UI components: shadcn first, always

This app's UI primitives come from shadcn (style `base-vega`, built on Base UI,
not Radix). They live in `src/components/ui/`. **Use them for every control and
overlay.** Do not hand-roll a control the registry already has.

- **Never** ship a bare `<select>`, `<input>`, `<textarea>`, `<input type="checkbox">`,
  `<label>`, `<dialog>`, `<details>`, or a `<button>` styled by hand. Use `Select`,
  `Input`, `Textarea`, `Checkbox`, `Label`, `Dialog`, `Collapsible`/`Accordion`, `Button`.
  (A file picker is `<Input type="file" />`.)
- **Pick the right component, there are ~50.** Confirmations: `AlertDialog`. Forms
  and modals: `Dialog` or `Sheet`. Menus: `DropdownMenu`. Errors and notices: `Alert`.
  Toggles: `Switch`, `Checkbox`, `ToggleGroup`. Form layout and errors: `Field`
  (`FieldLabel`, `FieldDescription`, `FieldError`). Empty states: `Empty`. Status
  chips: `Badge`. Dividers: `Separator`. Also available: `Accordion`, `Tabs`,
  `Tooltip`, `Popover`, `Command`, `Table`, `Breadcrumb`, `Skeleton`, `Spinner`,
  `Sonner` (toasts), `Kbd`, `Progress`, `Slider`, `ScrollArea`, `Avatar`, `Card`.
- **If it is not in `src/components/ui/`, look it up and install it. Do not build it.**
  ```bash
  ./node_modules/.bin/shadcn search @shadcn -q <name>   # find it (add --limit 200 to list all)
  ./node_modules/.bin/shadcn docs <name>                # API and usage examples
  ./node_modules/.bin/shadcn add <name> -y              # install it (and its dependencies)
  ```
  The CLI asks before overwriting an existing file. **Never overwrite `button.tsx`**
  or any component we have restyled: answer no (`yes n | shadcn add <name>`) and
  check `git diff src/components/ui` afterwards.
- **This is Base UI, not Radix.** Read the generated file before using it. Triggers
  compose with the `render` prop, not `asChild`, and `Select` takes `items` so
  `SelectValue` can show a label. Do not assume the Radix API from memory.
- **Theme comes from tokens, not from components.** Colours, 0 radius, no shadows
  and the fonts are set in `src/app/globals.css`; generated components inherit
  them. Do not hardcode colours or add `rounded-*`/`shadow-*` to fix a look. If a
  generated component looks off, fix the token or the one class, not the whole
  component.
- **Bespoke components are for identity only**, where shadcn has no equivalent:
  `Pane`, `Divider`, `StatusBar`, `ShellHeader` (in `src/components/shell/`) and
  the effects (`FaultyTerminal`, `Dither`, `GradientASCII`). Everything else is shadcn.
- Before calling UI work done, load the page in a real browser at 1907x1043 and look
  at it. Passing lint and types says nothing about whether it looks right.

## UX bar: build it for the person using it

You are shipping a product, not a demo. Before calling a screen done, ask what a
person would trip over.

- **One row, one thing.** Lists are tables (`Table`), one line per item. Never let a
  value wrap into a column of fragments; truncate or clamp it.
- **Quiet actions.** Row actions are icon buttons with a `Tooltip`. Rare or
  destructive ones go in a `DropdownMenu` behind a "more" button. Never a row of
  five text buttons.
- **Bulk is not optional** for lists people manage: row `Checkbox`es, a select-all,
  and a selection bar (count, bulk action, clear).
- **Primary action up top, forms in dialogs.** "Add" is a button that opens a
  `Dialog`; don't leave a form permanently under a list.
- **Confirm the destructive, then get out of the way.** Delete uses `AlertDialog`,
  and the dialog must close once the action starts (`AlertDialogAction` does not
  close itself). Say what happens to history or data.
- **Say what happened.** Success and failure notices are plain sentences, and
  transient ones clear themselves.
- **Titles are readable.** Dialog, sheet and empty-state titles use the mono face.
  Only the wordmark and `Pane` titles use the blackletter `font-display`.
- **Think about the whole journey**, not just the screen: if someone can create a
  thing, they must also be able to choose where it goes.
