FROM node:18-alpine

WORKDIR /app

# instalar dependências necessárias para compilar better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 3000

CMD ["npm","start"]
