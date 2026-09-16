import { bookABet, findBookABet, getSports } from "../src/betway/client";
import { UpstreamError } from "../src/betway/errors";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("findBookABet", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("returns ok with selections for a valid code", async () => {
    const selection = { outcomeId: "1", marketId: "1", marketName: "1X2" };
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(200, { selections: [selection] }),
    );

    const result = await findBookABet("BW72B383EE");

    expect(result).toEqual({ kind: "ok", selections: [selection] });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("returns dead for a 200 response with an empty selections array", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(200, { selections: [] }));

    const result = await findBookABet("BW6E59F360");

    expect(result).toEqual({ kind: "dead" });
  });

  test("returns dead for BookABetInvalidCode (6000331)", async () => {
    // Every call gets one retry (see fetchWithRetry), so a genuinely dead code returns
    // the same error on both attempts.
    const response = jsonResponse(400, { errorCode: 6000331, errorMessage: "BookABetInvalidCode" });
    (global.fetch as jest.Mock).mockResolvedValueOnce(response).mockResolvedValueOnce(response);

    const result = await findBookABet("BWDEADBEEF");

    expect(result).toEqual({ kind: "dead" });
  });

  test("returns dead for BookABetSelectionsExpired (6000332)", async () => {
    const response = jsonResponse(400, {
      errorCode: 6000332,
      errorMessage: "BookABetSelectionsExpired",
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce(response).mockResolvedValueOnce(response);

    const result = await findBookABet("BW6E59F360");

    expect(result).toEqual({ kind: "dead" });
  });

  test("throws UpstreamError for an unmapped error code", async () => {
    const response = jsonResponse(400, { errorCode: 10, errorMessage: "UnexpectedError" });
    (global.fetch as jest.Mock).mockResolvedValueOnce(response).mockResolvedValueOnce(response);

    await expect(findBookABet("BW00000000")).rejects.toThrow(UpstreamError);
  });

  test("retries once after a rate-limited first attempt, then succeeds", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonResponse(400, { errorCode: 6000359, errorMessage: "BookABetLimitExceeded" }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { selections: [{ outcomeId: "1" }] }));

    const result = await findBookABet("BW72B383EE");

    expect(result.kind).toBe("ok");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("bookABet", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("returns the created booking code", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(200, { bookingCode: "BW72B383EE" }),
    );

    const result = await bookABet(["7469919811"]);

    expect(result).toEqual({ bookingCode: "BW72B383EE" });
  });

  test("throws UpstreamError on failure", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(400, { errorCode: 10, errorMessage: "UnexpectedError" }))
      .mockResolvedValueOnce(jsonResponse(400, { errorCode: 10, errorMessage: "UnexpectedError" }));

    await expect(bookABet([])).rejects.toThrow(UpstreamError);
  });
});

describe("getSports", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("filters out promo tiles, keeping only real sports", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(200, {
        sports: [
          { sportId: "soccer", name: "Soccer", sportType: "Sport" },
          { sportId: "Codes", name: "Codes", sportType: "Promo" },
        ],
      }),
    );

    const sports = await getSports();

    expect(sports).toEqual([{ sportId: "soccer", name: "Soccer", sportType: "Sport" }]);
  });
});
