# Assistente de Calendários Acadêmicos DENTEC/PROENS

Aplicação web em fase alpha para elaborar calendários acadêmicos, conferir dias letivos e registrar a revisão técnico-pedagógica. Usa React, TypeScript e Convex.

A autenticação usa Convex Auth no próprio backend Convex. O login pelo Google está intencionalmente desabilitado até segundo aviso; consulte [Acesso e contas](docs/recuperacao-de-senha.md).

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

`check` executa localmente formatação, lint, tipos, testes unitários, testes de navegador e visuais e build. É a validação obrigatória antes de uma release normal; `deploy:production` a executa antes de publicar. O modo opcional `deploy:production:fast` exige pedido explícito de **fast release** e omite essa validação e o smoke; consulte [Implantação e operação](docs/implantacao-convex-vercel.md#fast-release). O teste do runtime PDF usa Linux e roda pelo Docker Desktop, com `pnpm test:runtime:linux`. Consulte [comandos, desempenho, referências visuais e E2E](docs/verificacao.md).

## Documentação

- [Desenvolvimento](docs/desenvolvimento.md)
- [Guia da aplicação](docs/uso.md)
- [Arquitetura](docs/arquitetura-convex.md)
- [Acesso e contas](docs/recuperacao-de-senha.md)
- [Segurança da aplicação](docs/seguranca.md)
- [Implantação e operação](docs/implantacao-convex-vercel.md)
- [Operações administrativas de dados](docs/migracao-schema.md)
- [Restauração dos originais](docs/restauracao-de-originais.md)

Produção: [calendario-academico-phi.vercel.app](https://calendario-academico-phi.vercel.app). Publicações seguem o procedimento de implantação e operação.

## Licença e autoria

Software disponibilizado sob a [licença MIT](LICENSE), com titularidade dos direitos patrimoniais do Instituto Federal de Educação, Ciência e Tecnologia do Paraná — IFPR. A unidade responsável pelo projeto é a DENTEC/PROENS. Consulte [Autoria e reconhecimento](AUTHORS.md) para os créditos.

Dependências e materiais de terceiros permanecem sujeitos às respectivas licenças e condições de uso. A licença do software não concede direitos sobre marcas e logotipos institucionais.
