import type { FastifyInstance } from "fastify";
import { getUpcomingEvents } from "../betway/client";
import { joinMarketsWithOutcomes } from "../domain/marketJoin";

interface EventsQuery {
  sportId: string;
  skip?: number;
  take?: number;
}

export function registerEventsRoute(app: FastifyInstance): void {
  app.get<{ Querystring: EventsQuery }>(
    "/api/events",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["sportId"],
          properties: {
            sportId: { type: "string", minLength: 1 },
            skip: { type: "integer", minimum: 0 },
            take: { type: "integer", minimum: 1, maximum: 50 },
          },
        },
      },
    },
    async (request) => {
      const { sportId, skip, take } = request.query;
      const data = await getUpcomingEvents({ sportId, skip, take });
      const joined = joinMarketsWithOutcomes(data.markets, data.outcomes, data.prices);

      const marketsByEventId = new Map<number, typeof joined>();
      for (const entry of joined) {
        const existing = marketsByEventId.get(entry.market.eventId);
        if (existing) {
          existing.push(entry);
        } else {
          marketsByEventId.set(entry.market.eventId, [entry]);
        }
      }

      return {
        events: data.events.map((event) => ({
          eventId: event.eventId,
          name: event.name,
          homeTeam: event.homeTeam,
          awayTeam: event.awayTeam,
          league: event.league,
          region: event.region,
          expectedStartEpoch: event.expectedStartEpoch,
          isActive: event.isActive,
          isLive: event.isLive,
          markets: (marketsByEventId.get(event.eventId) ?? []).map(({ market, outcomes }) => ({
            marketId: market.marketId,
            displayName: market.displayName,
            outcomes: outcomes.map(({ outcome, price }) => ({
              outcomeId: outcome.outcomeId,
              displayName: outcome.displayName,
              index: outcome.index,
              priceDecimal: price?.priceDecimal,
            })),
          })),
        })),
        isFinalPage: data.isFinalPage,
      };
    },
  );
}
