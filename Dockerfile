# ---- 1. Build Angular client ----
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npx ng build

# ---- 2. Build API ----
FROM node:22-alpine AS server
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build && npm prune --omit=dev

# ---- 3. Runtime: single non-root container serving API + static UI ----
FROM node:22-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=server /app/server/package.json ./server/package.json
COPY --from=server /app/server/node_modules ./server/node_modules
COPY --from=server /app/server/dist ./server/dist
COPY --from=client /app/client/dist ./client/dist
USER node
WORKDIR /app/server
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "dist/server.js"]
