import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db/client";
import { limitAuth } from "@/lib/http/auth-limits";

const handler = toNextJsHandler(auth);

// Every auth request is counted per client address first (see lib/http/auth-limits.ts).
export async function GET(request: Request) {
  return (await limitAuth(db, request)) ?? handler.GET(request);
}

export async function POST(request: Request) {
  return (await limitAuth(db, request)) ?? handler.POST(request);
}
