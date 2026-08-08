FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY gristClient.mjs server.mjs ./
COPY public ./public

ENV NODE_ENV=production
ENV PORT=5177

EXPOSE 5177

CMD ["node", "server.mjs"]
