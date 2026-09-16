import type { FastifyInstance } from "fastify";
import { getEventMarkets } from "../betway/client";
import { joinMarketsWithOutcomes } from "../domain/marketJoin";

interface EventMarketsParams {
  eventId: string;
}

export function registerEventMarketsRoute(app: FastifyInstance): void {
  app.get<{ Params: EventMarketsParams }>(
    "/api/events/:eventId/markets",
    {
      schema: {
        params: {
          type: "object",
          required: ["eventId"],
          properties: {
            eventId: { type: "string", pattern: "^[0-9]+$" },
          },
        },
      },
    },
    async (request) => {
      const eventId = Number(request.params.eventId);
      const data = await getEventMarkets(eventId);
      const joined = joinMarketsWithOutcomes(data.marketsInGroup, data.outcomes, data.prices);

      return {
        markets: joined.map(({ market, outcomes }) => ({
          marketId: market.marketId,
          displayName: market.displayName,
          outcomes: outcomes.map(({ outcome, price }) => ({
            outcomeId: outcome.outcomeId,
            displayName: outcome.displayName,
            sbv: outcome.sbv,
            index: outcome.index,
            priceDecimal: price?.priceDecimal,
          })),
        })),
      };
    },
  );
}
