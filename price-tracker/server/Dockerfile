# syntax=docker/dockerfile:1

# One image serves all three server roles — API, worker and scheduler. They are
# separate *processes*, selected by the compose `command`, not separate builds.
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---------- development: hot reload against a bind-mounted source tree ----------
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]

# ---------- build ----------
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- production ----------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Run unprivileged.
USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
