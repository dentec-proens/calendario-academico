# Assistente de Calendários Acadêmicos DENTEC/PROENS

Aplicação alpha com React, Vite, TypeScript e Convex. Autenticação, consultas reativas, dados, arquivos e processamento de PDFs ficam no Convex. A Vercel hospeda o portal estático.

## Duas rotinas

Os dois desenvolvedores trabalham nos mesmos teams Dentec e no mesmo repositório. Cada um usa seu próprio deployment Convex de desenvolvimento; ambos podem publicar em produção, sem PR obrigatório ou ambiente intermediário.

Na primeira vez, com Node.js 24 e pnpm 12.15.0:

```sh
pnpm install --frozen-lockfile
pnpm dev:setup
```

Depois, para trabalhar:

```sh
pnpm dev
```

O portal abre em http://127.0.0.1:4183, com Convex e Vite acompanhando as alterações. Ctrl+C encerra os dois. A configuração individual fica em `.env.local`, ignorado pelo Git. Não copie esse arquivo de outro desenvolvedor. `pnpm env:doctor` confere os destinos locais sem chamadas remotas.

Para publicar uma versão commitada em `main`:

```sh
pnpm deploy:production
```

O comando verifica o código, publica as funções no Convex de produção e envia `main` ao GitHub; a integração Git da Vercel publica o portal. `pnpm deploy:production --dry-run` mostra o plano sem chamadas remotas. Os alvos públicos ficam versionados em [`config/environments.ts`](config/environments.ts).

[Preparação do desenvolvimento](docs/desenvolvimento.md) · [Publicação em produção](docs/implantacao-convex-vercel.md)

## Qualidade e build local

`pnpm check` executa formatação, lint, lint com análise de tipos, TypeScript estrito, testes e build. A CI usa o mesmo comando, sem credenciais de deployment. TypeScript 7.0.2, Oxlint 1.89.0 e dependências têm versões fixadas; módulos maiores de cálculo e editor continuam em JavaScript durante a conversão progressiva.

Para conferir o build local, use `pnpm build` e `pnpm start`. A saída fica em `dist/app/`, servida em `127.0.0.1:4183`; `PORT` permite outra porta. `INICIAR.cmd` executa essa sequência no Windows. O build não publica funções nem inicializa dados.

## Fluxos e dados

ADMIN gerencia contas, campi, base institucional, documentos e revisão humana. CAMPUS altera somente os calendários da unidade autorizada. O backend verifica identidade e vínculo em cada operação.

**Adicionar/Aplicar** confirma os campos locais. As alterações aplicadas são salvas automaticamente, com indicação de sucesso, falha ou conflito; campos ainda não aplicados ficam protegidos de atualizações remotas. **Baixar cópia** inclui os dados aplicados. A conferência de uma nova base institucional e o salvamento da análise humana permanecem explícitos. Testes e propostas não representam aprovação institucional.

IDs, credenciais compatíveis, snapshots e referências da migração foram preservados. Os **13 PDFs originais continuam pendentes de transferência**; os comandos de desenvolvimento e publicação não importam nem reanalisam esses arquivos. `oceanic-gazelle-652` continua sendo o desenvolvimento já configurado de Gustavo.

Segredos de autenticação pertencem ao ambiente Convex, sem prefixo `VITE_*`. A recuperação de acesso usa links temporários gerados pelo ADMIN; envio automático por e-mail ainda não está implementado.

## Estrutura

- `convex/`: funções, autenticação, arquivos e schema.
- `src/`: regras do calendário, snapshots e renderização.
- `web/`: portal React, cliente Convex e editor.
- `scripts/`: preparação, desenvolvimento, qualidade e publicação.
- `test/`: domínio e funções Convex isoladas.

[Arquitetura](docs/arquitetura-convex.md) · [Especificação](docs/especificacao.md) · [Proveniência dos dados](docs/migracao-dados.md) · [Recuperação de acesso](docs/recuperacao-de-senha.md)
