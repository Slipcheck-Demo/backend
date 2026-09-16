FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run prisma:generate && npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY --from=build /app/generated ./generated
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/src/index.js"]
