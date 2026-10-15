FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY rooms.js discord-adapter.js server.js ./
USER node
EXPOSE 3170
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- "http://127.0.0.1:${PORT:-3170}/health" > /dev/null || exit 1
CMD ["node", "server.js"]
