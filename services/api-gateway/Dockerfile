FROM node:26-alpine AS builder
WORKDIR /app
COPY shared/src ./shared/src
COPY shared/package.json ./shared/package.json
COPY services/api-gateway/package.json ./services/api-gateway/package.json
COPY services/api-gateway/tsconfig.json ./services/api-gateway/tsconfig.json
COPY services/api-gateway/src ./services/api-gateway/src
WORKDIR /app/services/api-gateway
RUN npm install
RUN npx tsc --project tsconfig.json

FROM node:26-alpine AS production
WORKDIR /app
RUN addgroup -S pingpulse && adduser -S pingpulse -G pingpulse
COPY --from=builder /app/services/api-gateway/package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=builder /app/services/api-gateway/dist ./dist
USER pingpulse
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s \
  CMD wget -qO- http://localhost:${PORT:-3000}/health || exit 1
CMD ["node", "dist/index.js"]
