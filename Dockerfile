FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci --workspaces --include-workspace-root

COPY client ./client
COPY server ./server
RUN npm run build -w client && npm run build -w server \
 && cp -r server/src/prompts server/dist/prompts \
 && cp -r server/src/prompt_templates server/dist/prompt_templates

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY server/package.json ./server/
RUN npm ci --omit=dev -w server && npm cache clean --force

COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

ENV PORT=5101
EXPOSE 5101

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5101/api/health || exit 1

CMD ["node", "server/dist/index.js"]
