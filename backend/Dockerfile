# Stage 1: Install dependencies and generate Prisma Client
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci
RUN npx prisma generate

# Stage 2: Compile TypeScript source
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json tsconfig.json ./
COPY prisma ./prisma/
COPY src ./src/

RUN npm run build

# Stage 3: Production runtime image
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY package*.json ./

EXPOSE 4000

CMD ["node", "dist/index.js"]
