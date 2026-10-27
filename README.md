# Assistente de Calendários Acadêmicos DENTEC/PROENS

Aplicação web em fase alpha para elaborar calendários acadêmicos, conferir dias letivos e registrar a revisão técnico-pedagógica. Usa React, TypeScript e Convex.

## Desenvolvimento

Requisitos: Node.js 24 e pnpm 12.15.0.

```sh
pnpm install --frozen-lockfile
pnpm dev:setup
pnpm dev
```

Acesse [localhost:4183](http://127.0.0.1:4183). Cada desenvolvedor usa seu próprio deployment Convex, identificado em `.env.local`. Consulte [preparação e primeiro acesso](docs/desenvolvimento.md).

Para conferir o build local:

```sh
pnpm build
pnpm start
```

## Verificação

```sh
pnpm test:browser:install
pnpm check
```

`check` executa localmente formatação, lint, tipos, testes unitários, testes de navegador e visuais e build. É a validação obrigatória antes de uma release; `deploy:production` a executa antes de publicar. O teste do runtime PDF usa Linux e roda pelo Docker Desktop, com `pnpm test:runtime:linux`. Consulte [comandos, desempenho, referências visuais e E2E](docs/verificacao.md).

## Documentação

- [Desenvolvimento](docs/desenvolvimento.md)
- [Guia da aplicação](docs/uso.md)
- [Arquitetura](docs/arquitetura-convex.md)
- [Acesso e contas](docs/recuperacao-de-senha.md)
- [Implantação e operação](docs/implantacao-convex-vercel.md)
- [Operações administrativas de dados](docs/migracao-schema.md)
- [Restauração dos originais](docs/restauracao-de-originais.md)

Produção: [calendario-academico-phi.vercel.app](https://calendario-academico-phi.vercel.app). Publicações seguem o procedimento de implantação e operação.
