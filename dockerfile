
FROM node:20-alpine AS builder

WORKDIR /app

# Copia dependencias primeiro (cache do Docker)
COPY package*.json ./
COPY prisma ./prisma/


RUN npm install

# Gera o Prisma Client
RUN npx prisma generate


COPY . .


RUN npm run build


# ─────────────────────────────────────────
# STAGE 2 — Produção (imagem final enxuta)
# ─────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Instala curl para o healthcheck funcionar
RUN apk add --no-cache curl

# Copia só o necessário do stage anterior
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./

# Usuário não-root por segurança
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

# Roda as migrations e sobe o servidor
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]