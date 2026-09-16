import { prisma } from "./client";

interface RequestLogEntry {
  operation: "resolve" | "create" | "convert";
  bookingCode?: string | null;
  resultCode?: string | null;
  status: "ok" | "invalid_code" | "conflicting_selections" | "upstream_error";
  legCount?: number | null;
}

// Fire-and-forget: never awaited by callers, and its own rejection is caught here so a
// transient DB failure while writing this audit row can never turn an otherwise-successful
// (or already-failing) request into an unrelated 500 — it only costs the row.
export function logRequest(entry: RequestLogEntry): void {
  prisma.bookingCodeRequest.create({ data: entry }).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error("failed to write booking-code request log", err);
  });
}
