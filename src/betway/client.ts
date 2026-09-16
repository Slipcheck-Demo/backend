import { BETWAY_ERROR_CODES, UpstreamError } from "./errors";
import type {
  DecodeResult,
  DecodeSelection,
  EncodeResult,
  EventMarketsResponse,
  Sport,
  UpcomingEventsResponse,
} from "./types";

// Domains verified live 2026-09-16 — docs/betway-api.md §1.
const CONFIG_BASE = "https://config.betwayafrica.com";
const FEEDS_BASE = "https://feeds-roa2.betwayafrica.com/br/_apis/sport/v1";
const BETTING_BASE = "https://www.betway.com.ng/appsynapse/bet-api-sr";

const RETRY_DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A network-level failure (DNS, connection refused/reset, timeout) makes `fetch` itself
// reject rather than resolve with a non-ok Response. Treat that the same as a non-ok
// response for retry purposes, and surface it as an UpstreamError like every other upstream
// failure instead of letting a raw TypeError escape to the app-level error handler (which
// would otherwise map it to a generic 500 instead of 502, and skip the upstream_error log).
async function fetchOnce(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    throw new UpstreamError(
      `network request to ${url} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// docs/betway-api.md §2 records a transient 400 that succeeded on immediate retry, and
// Discrepancy #1 records a rate limit (errorCode 6000359) under rapid requests. Both look
// like "the first attempt failed for a reason that isn't really about this request" — so
// every call gets one retry before its result is treated as final.
async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  const first = await fetchOnce(url, init);
  if (first.ok) return first;
  await delay(RETRY_DELAY_MS);
  return fetchOnce(url, init);
}

interface BetwayErrorBody {
  errorCode?: number;
  errorMessage?: string;
}

export async function findBookABet(bookingCode: string): Promise<DecodeResult> {
  const res = await fetchWithRetry(`${BETTING_BASE}/v2/Betting/FindBookABet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ countryCode: "NG", bookingCode, cultureCode: "en-US" }),
  });

  if (res.ok) {
    const body = (await res.json()) as { selections?: DecodeSelection[] };
    if (!body.selections || body.selections.length === 0) {
      return { kind: "dead" };
    }
    return { kind: "ok", selections: body.selections };
  }

  const body = (await res.json().catch(() => ({}))) as BetwayErrorBody;
  if (
    body.errorCode === BETWAY_ERROR_CODES.INVALID_CODE ||
    body.errorCode === BETWAY_ERROR_CODES.SELECTIONS_EXPIRED
  ) {
    return { kind: "dead" };
  }
  throw new UpstreamError(
    `FindBookABet failed: ${body.errorMessage ?? res.status}`,
    body.errorCode,
  );
}

export async function bookABet(outcomeIds: string[]): Promise<EncodeResult> {
  const res = await fetchWithRetry(`${BETTING_BASE}/v1/Betting/BookABet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cultureCode: "en-US",
      countryCode: "NG",
      isSingleBet: false,
      outcomes: outcomeIds.map((outcomeId) => ({ outcomeId })),
    }),
  });

  if (res.ok) {
    const body = (await res.json()) as { bookingCode: string };
    return { bookingCode: body.bookingCode };
  }

  const body = (await res.json().catch(() => ({}))) as BetwayErrorBody;
  throw new UpstreamError(`BookABet failed: ${body.errorMessage ?? res.status}`, body.errorCode);
}

export async function getSports(): Promise<Sport[]> {
  const res = await fetchWithRetry(`${CONFIG_BASE}/cron/sports/NG/en-US`);
  if (!res.ok) {
    throw new UpstreamError(`sports fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as { sports: Sport[] };
  // docs/betway-api.md §4: 3 of the 28 entries are promo tiles ("Codes", "Swipe Bet",
  // "Betway Stream"), not sports — filter them out.
  return body.sports.filter((sport) => sport.sportType === "Sport");
}

export async function getUpcomingEvents(params: {
  sportId: string;
  skip?: number;
  take?: number;
}): Promise<UpcomingEventsResponse> {
  const qs = new URLSearchParams({
    countryCode: "NG",
    sportId: params.sportId,
    Skip: String(params.skip ?? 0),
    Take: String(params.take ?? 20),
    cultureCode: "en-US",
    isEsport: "false",
    boostedOnly: "false",
  });
  qs.append("marketTypes", "[Win/Draw/Win]");

  const res = await fetchWithRetry(`${FEEDS_BASE}/BetBook/Upcoming/?${qs.toString()}`);
  if (!res.ok) {
    throw new UpstreamError(`upcoming events fetch failed: ${res.status}`);
  }
  return (await res.json()) as UpcomingEventsResponse;
}

export async function getEventMarkets(eventId: number): Promise<EventMarketsResponse> {
  // docs/betway-api.md §4.4: requesting only marketGroupId=Main already covers 1X2, Double
  // Chance, Draw No Bet, Total and Handicap in one call.
  const qs = new URLSearchParams({
    eventId: String(eventId),
    marketGroupId: "Main",
    countryCode: "NG",
    cultureCode: "en-US",
    skip: "0",
    take: "20",
    isBuildABetOnly: "false",
    searchQuery: "",
  });

  const res = await fetchWithRetry(
    `${FEEDS_BASE}/MarketGroupings/MarketGroupNamesAndMarketsForEvent?${qs.toString()}`,
  );
  if (!res.ok) {
    throw new UpstreamError(`event markets fetch failed: ${res.status}`);
  }
  return (await res.json()) as EventMarketsResponse;
}
