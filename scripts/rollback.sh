#!/bin/bash

# Script de Rollback - LeilaoPro
# Uso: ./scripts/rollback.sh [v1.x.x]

VERSION=$1

if [ -z "$VERSION" ]; then
  echo "Uso: ./rollback.sh [tag_versao_anterior]"
  exit 1
fi

echo "--- Iniciando Rollback para a versão $VERSION ---"

# Voltar para a tag anterior
git fetch --tags
git checkout tags/$VERSION

# Reiniciar containers
docker-compose down
docker-compose up -d --build

echo "--- Rollback completado! Sistema restaurado para $VERSION ---"
