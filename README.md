# LeilaoPro - SaaS de Gestão de Leilões

Sistema simplificado para gestão de editais, contratos e leiloeiros com análise via Inteligência Artificial.

## Estrutura do Repositório

*   `/backend`: API Node.js e lógica de negócio.
*   `/frontend`: Interface web vanilla JS/CSS.
*   `/database`: Controle de migrations e banco de dados.
*   `/n8n`: Fluxos e configurações de automação.
*   `/docs`: Documentação técnica e manuais.
*   `/scripts`: Utilitários de deploy e manutenção.

## Como Executar

### Pré-requisitos
- Node.js instalado.
- n8n configurado (para análise de IA).

### Instalação
1.  Clone o repositório.
2.  Entre em `/backend` e rode `npm install`.
3.  Configure o arquivo `.env` baseado no `.env.example`.
4.  Inicie o servidor: `npm start`.

## Versionamento e Deploy
Consulte o arquivo [VERSIONING.md](./VERSIONING.md) para detalhes sobre o fluxo de desenvolvimento e publicação.

---
© 2026 Hubkron.
