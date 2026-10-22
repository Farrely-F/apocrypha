import { Minus } from "lucide-react";
import { Pane } from "@/components/shell";
import type { OrgRole } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { PERMISSIONS, ROLE_BLURB, type Grant } from "@/lib/workspace/permissions";

const ROLES: readonly OrgRole[] = ["owner", "admin", "member"];

function Mark({ grant }: { grant: Grant }) {
  if (grant === "yes") return <span aria-label="Allowed" className="inline-block size-2 bg-signal" />;
  if (grant === "partial") return <span aria-label="Limited" className="inline-block size-2 border border-signal bg-transparent" />;
  return <Minus aria-label="Not allowed" className="mx-auto size-3 text-bone-faint/60" />;
}

/**
 * The fixed roles and what each may do, read-only. The rows are drawn from the lists the server enforces
 * (lib/workspace/roles.ts), and your own column is marked.
 */
export function PermissionsPane({ role }: { role: OrgRole }) {
  const groups = [...new Set(PERMISSIONS.map((p) => p.group))];
  return (
    <Pane title="Roles and permissions" meta="3 fixed roles" flush className="bg-abyss/65 backdrop-blur-md">
      <div className="grid gap-px border-b border-hairline-faint sm:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r} className={cn("px-5 py-4", r === role && "bg-signal/[0.045]")}>
            <p className="flex items-center gap-2 text-[0.66rem] uppercase tracking-[0.2em] text-bone">
              <span aria-hidden className={cn("size-1.5", r === role ? "bg-signal" : "bg-bone-faint/60")} />
              {r}
              {r === role && <span className="text-signal">you</span>}
            </p>
            <p className="mt-1.5 text-xs text-bone-dim">{ROLE_BLURB[r]}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-[0.65rem] uppercase tracking-[0.2em] text-bone-faint">
              <th scope="col" className="h-9 pl-5 text-left font-normal">
                <span className="sr-only">Permission</span>
              </th>
              {ROLES.map((r) => (
                <th key={r} scope="col" className={cn("h-9 w-24 text-center font-normal", r === role && "text-signal")}>
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g} className="border-t border-hairline-faint">
              <tr>
                <th scope="rowgroup" colSpan={4} className="px-5 pt-3 pb-1 text-left text-[0.65rem] font-normal uppercase tracking-[0.2em] text-bone-faint">
                  {g}
                </th>
              </tr>
              {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                <tr key={p.id} className="align-top">
                  <th scope="row" className="py-2 pl-5 pr-4 text-left font-normal text-bone">
                    {p.label}
                    {p.detail && <span className="mt-0.5 block text-xs text-bone-faint">{p.detail}</span>}
                  </th>
                  {ROLES.map((r) => (
                    <td key={r} className={cn("py-2.5 text-center", r === role && "bg-signal/[0.045]")}>
                      <Mark grant={p.grants[r]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <p className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-hairline-faint px-5 py-3 text-xs text-bone-faint">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block size-2 bg-signal" /> allowed
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block size-2 border border-signal" /> limited, see the note
        </span>
        <span className="ml-auto">Finer control is per environment: use the sliders icon on a member.</span>
      </p>
    </Pane>
  );
}
