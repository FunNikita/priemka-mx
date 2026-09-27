FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci
COPY . .
RUN npm run build -w @priemka/web && npm run build -w @priemka/api

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/app/certs/russian-trusted-root-ca.pem
COPY apps/api/certs/russian-trusted-root-ca.pem /app/certs/russian-trusted-root-ca.pem
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/assets ./apps/api/assets
COPY --from=build /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
RUN mkdir -p /app/data/media /app/data/documents /app/data/logs && chown -R node:node /app/data /app/apps/api
USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["sh", "-c", "../../node_modules/.bin/prisma migrate deploy --config prisma.config.ts && npm run start"]
