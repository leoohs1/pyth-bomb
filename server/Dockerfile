# Receita do servidor de jogo do Pyth Bomb PVP pro Railway.
# É montada a partir da RAIZ do repositório (o servidor usa as regras de src/pvp/engine, que ficam fora de server/),
# mas copia só o necessário: o servidor e as regras do PVP. O site (React) não entra aqui.
FROM node:22-alpine

WORKDIR /app

# as regras do PVP são módulos modernos (import/export): avisa o Node
RUN echo '{ "type": "module", "private": true }' > package.json

COPY server/package.json server/package-lock.json ./server/
RUN npm ci --prefix server --omit=dev

COPY server/ ./server/
COPY src/pvp/engine/ ./src/pvp/engine/
COPY src/pvp/bracket.js ./src/pvp/bracket.js

ENV NODE_ENV=production
CMD ["node", "server/index.js"]
