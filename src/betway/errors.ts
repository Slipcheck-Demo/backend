// Betway error codes observed in docs/betway-api.md.
export const BETWAY_ERROR_CODES = {
  INVALID_CODE: 6000331,
  SELECTIONS_EXPIRED: 6000332,
  LIMIT_EXCEEDED: 6000359,
  UNEXPECTED: 10,
} as const;

// Raised for anything that isn't a normal "dead code" outcome — network failure, an
// unmapped Betway error code, or a non-2xx from a plain proxy endpoint (sports/events/
// markets). Never surface `betwayErrorCode`/the raw message to API clients (per
// docs/betway-api.md §10) — map this to the backend's own `upstream_error` status instead.
export class UpstreamError extends Error {
  betwayErrorCode?: number;

  constructor(message: string, betwayErrorCode?: number) {
    super(message);
    this.name = "UpstreamError";
    this.betwayErrorCode = betwayErrorCode;
  }
}
