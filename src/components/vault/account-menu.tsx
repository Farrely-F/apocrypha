"use client";

import Link from "next/link";
import { Activity, BookOpen, ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { UserAvatar } from "@/components/brand/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SigningOut, useSignOut } from "./sign-out-button";

/** Who you are signed in as, with the way to your settings and out. */
export function AccountMenu({ email, systemAdmin = false }: { email: string; systemAdmin?: boolean }) {
  const [signOut, signingOut] = useSignOut();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="sm" aria-label="Account" className="max-w-56 text-bone-faint" />}
        >
          <UserAvatar name={email} size={20} />
          <span className="hidden truncate xl:inline">{email}</span>
          <ChevronsUpDown aria-hidden className="hidden size-3 shrink-0 xl:inline" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2 truncate">
              <UserAvatar name={email} size={28} />
              <span className="truncate">{email}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/settings" />}>
            <Settings /> Settings
          </DropdownMenuItem>
          <DropdownMenuItem render={<a href="/docs" target="_blank" rel="noopener" />}>
            <BookOpen /> Documentation
          </DropdownMenuItem>
          {systemAdmin && (
            <DropdownMenuItem render={<Link href="/admin" />}>
              <Activity /> System
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => void signOut()}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {signingOut && <SigningOut />}
    </>
  );
}
