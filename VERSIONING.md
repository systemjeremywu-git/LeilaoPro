# Padrão de Versionamento - LeilaoPro

Este documento descreve as políticas de versionamento, branches e o fluxo de deploy do projeto.

## Estratégia de Branches

O projeto utiliza um modelo simplificado de branches:

*   **`main`**: Branch de produção. Contém o código estável e pronto para uso final. Todos os merges para a `main` devem ser acompanhados de uma Git Tag de versão.
*   **`dev`**: Branch de desenvolvimento. É onde as novas funcionalidades e correções são integradas antes de irem para produção.

## Fluxo de Trabalho (Git Flow Simplificado)

1.  Desenvolvimento ocorre na branch `dev`.
2.  Quando uma funcionalidade está testada e estável, o desenvolvedor solicita o merge para a `main`.
3.  Após o merge, uma Tag é criada (ex: `v1.2.0`).
4.  O deploy é disparado a partir da Tag ou da branch `main`.

## Padrão de Versões (SemVer)

Seguimos o **Semantic Versioning 2.0.0**: `MAJOR.MINOR.PATCH`

*   **MAJOR**: Mudanças incompatíveis (quebra de contrato ou arquitetura).
*   **MINOR**: Novas funcionalidades que não quebram compatibilidade.
*   **PATCH**: Correções de bugs e melhorias internas.

Exemplos: `v1.0.0`, `v1.1.2`, `v2.0.1`

## Como criar uma nova versão

```bash
# Estando na branch main
git checkout main
git merge dev
git tag -a v1.x.x -m "Release v1.x.x: Descrição rápida"
git push origin main --tags
```

## Fluxo de Deploy (VPS/Portainer)

1.  O código é enviado para o GitHub.
2.  O Portainer (ou script de deploy) puxa a versão mais recente da branch `main`.
3.  O `docker-compose.yml` reconstrói os containers com a nova imagem.

## Rollback

Para voltar a uma versão anterior em caso de erro crítico:

```bash
git checkout tags/v1.x.y
# Re-instalar dependências se necessário e reiniciar serviço
```
