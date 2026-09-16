import request from "supertest";
import { buildApp } from "../src/app";
import { getSports } from "../src/betway/client";
import { UpstreamError } from "../src/betway/errors";

jest.mock("../src/betway/client");
jest.mock("../src/db/client", () => ({
  prisma: { bookingCodeRequest: { create: jest.fn().mockResolvedValue({}) } },
}));

const mockedGetSports = getSports as jest.MockedFunction<typeof getSports>;

describe("GET /api/sports", () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  test("returns the sports list from the upstream client", async () => {
    mockedGetSports.mockResolvedValueOnce([
      { sportId: "soccer", name: "Soccer", sportType: "Sport" },
    ]);

    const res = await request(app.server).get("/api/sports");

    expect(res.status).toBe(200);
    expect(res.body.sports).toEqual([{ sportId: "soccer", name: "Soccer", sportType: "Sport" }]);
  });

  test("maps an upstream failure to 502", async () => {
    mockedGetSports.mockRejectedValueOnce(new UpstreamError("boom"));

    const res = await request(app.server).get("/api/sports");

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "upstream_error" });
  });
});
