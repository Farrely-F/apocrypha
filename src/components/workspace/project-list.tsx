"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, X } from "lucide-react";
import { EmptyState } from "@/components/brand/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EnvChip, TagChips } from "@/components/workspace/details";
import { catalogue } from "@/components/workspace/list-view";
import { ProjectRowActions } from "@/components/workspace/workspace-dialogs";
import type { TreeProject } from "@/lib/workspace/manage";
import { projectPath } from "@/lib/workspace/shared";
import { cn } from "@/lib/utils";

/** Everything a person might type to find a project: its name, description, tags and environment names. */
const haystack = (p: TreeProject) =>
  [p.name, p.description ?? "", ...p.tags, ...p.environments.map((e) => e.name)].join(" ").toLowerCase();

/**
 * The projects of one organisation, with a search box and tag filters. Filtering happens here, in the
 * browser, over what the page already holds: nothing is sent anywhere.
 */
export function ProjectList({ orgId, projects, canBuild }: { orgId: string; projects: TreeProject[]; canBuild: boolean }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const allTags = useMemo(() => [...new Set(projects.flatMap((p) => p.tags))].sort(), [projects]);
  const siblings = useMemo(() => projects.map((p) => p.name), [projects]);

  const needle = query.trim().toLowerCase();
  const shown = projects.filter((p) => (!needle || haystack(p).includes(needle)) && [...picked].every((t) => p.tags.includes(t)));
  const filtering = needle !== "" || picked.size > 0;

  const toggle = (tag: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (!next.delete(tag)) next.add(tag);
      return next;
    });
  const clear = () => {
    setQuery("");
    setPicked(new Set());
  };

  return (
    <>
      {(projects.length > 4 || allTags.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline-faint px-5 py-3">
          <div className="relative w-full max-w-64">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-bone-faint" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects"
              aria-label="Search projects"
              autoComplete="off"
              className="h-8 pl-8"
            />
          </div>
          {allTags.length > 0 && <TagChips tags={allTags} active={picked} onSelect={toggle} />}
          {filtering && (
            <Button type="button" variant="ghost" size="sm" onClick={clear} className="ml-auto text-bone-faint">
              <X data-icon="inline-start" />
              Clear
            </Button>
          )}
        </div>
      )}
      {shown.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          actions={
            <Button type="button" size="sm" variant="outline" onClick={clear}>
              Clear filters
            </Button>
          }
        >
          No project here matches that search and those tags.
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(catalogue.head, "pl-5")}>Project</TableHead>
              <TableHead className={cn(catalogue.head, "hidden md:table-cell")}>Tags</TableHead>
              <TableHead className={catalogue.head}>Environments</TableHead>
              <TableHead className={cn(catalogue.head, "w-24 pr-3 text-right")}>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((p) => (
              <TableRow key={p.id} className={cn(catalogue.row, "h-auto")}>
                <TableCell className="max-w-[26rem] py-3 pl-5 whitespace-normal">
                  <Link href={projectPath(orgId, p.id)} className={catalogue.name}>
                    {p.name}
                  </Link>
                  {p.description && <p className="mt-0.5 line-clamp-2 text-sm text-bone-dim">{p.description}</p>}
                  <TagChips tags={p.tags} className="mt-1.5 md:hidden" />
                </TableCell>
                <TableCell className="hidden max-w-[16rem] py-3 whitespace-normal md:table-cell">
                  <TagChips tags={p.tags} active={picked} onSelect={toggle} />
                </TableCell>
                <TableCell className="py-3 whitespace-normal">
                  {p.environments.length === 0 ? (
                    <span className="text-bone-faint">none you can open</span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {p.environments.map((e) => (
                        <EnvChip key={e.id} name={e.name} kind={e.kind} />
                      ))}
                    </span>
                  )}
                </TableCell>
                <TableCell className="pr-3">
                  <div className="flex items-center justify-end gap-1">
                    <ProjectRowActions project={p} siblings={siblings} tags={allTags} canBuild={canBuild} redirect={`/o/${orgId}`} />
                    <Link href={projectPath(orgId, p.id)} aria-label={`Open ${p.name}`} className={catalogue.chevron}>
                      <ChevronRight aria-hidden className="size-4" />
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
