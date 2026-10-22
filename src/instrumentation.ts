import type { Instrumentation } from "next";
import { log } from "@/lib/log";

/**
 * Every uncaught server error becomes one structured log line, so the host's log search can find them. Only the
 * route template (`/o/[orgId]/settings`, not the real path), the method, the error's class and Next's digest are
 * written: the message and the request are where addresses and ids leak in, and they are not logged.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const requestId = request.headers["x-request-id"];
  log.error("request.error", {
    route: context.routePath,
    method: request.method,
    errorName: err instanceof Error ? err.name : typeof err,
    digest: typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined,
    requestId: Array.isArray(requestId) ? requestId[0] : requestId,
  });
};
