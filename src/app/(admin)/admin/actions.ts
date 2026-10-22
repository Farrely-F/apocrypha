"use server";

import { db } from "@/lib/db/client";
import { expireOverview } from "@/lib/system/cached";
import { requireAdminPage } from "@/lib/system/guard";

/** The Refresh button: forget the saved system-wide numbers so the next view counts again. Administrator only. */
export async function refreshOverview() {
  const gate = await requireAdminPage();
  if (gate.stale) throw new Error("Sign in again to use this page.");
  await expireOverview(db);
}
