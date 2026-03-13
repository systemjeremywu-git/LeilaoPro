#!/bin/bash

# Script de Deploy - LeilaoPro
# Uso: ./scripts/deploy.sh [v1.x.x]

VERSION=$1

if [ -z "$VERSION" ]; then
  echo "Uso: ./deploy.sh [tag_versao]"
  exit 1
fi

echo "--- Iniciando Deploy da versão $VERSION ---"

# Atualizar repositório
git checkout main
git pull origin main
git checkout tags/$VERSION

# Parar containers atuais
docker-compose down

# Reconstruir e subir
docker-compose up -d --build

echo "--- Deploy finalizado com sucesso! ---"
echo "Acesse: http://leilaopro.hubkron.uk"
