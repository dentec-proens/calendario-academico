# Publicação em produção

## Destinos

- Repositório: `dentec-proens/calendario-academico`, branch `main`.
- Convex: team `diretoria-de-ensino-tecnico-proens`, projeto `calendario-academico` (ID `3272722`).
- Desenvolvimento: `oceanic-gazelle-652`.
- Produção: `exuberant-cheetah-138`, https://exuberant-cheetah-138.convex.cloud.
- Vercel: team `dentec-proens`, projeto `calendario-academico` (ID `prj_AlAdqLCrChRgLBS1wRnjif72pF01`).
- Portal: https://calendario-academico-phi.vercel.app.

## Configuração

No deployment Convex de produção, `SITE_URL` deve ser `https://calendario-academico-phi.vercel.app`. `JWT_PRIVATE_KEY` e `JWKS` pertencem ao ambiente Convex; produção usa seu próprio par de assinatura. Nenhum segredo de autenticação pertence ao build Vite. Google permanece opcional e depende da configuração do provedor.

Na Vercel, as variáveis públicas de **Production**, do tipo Config, são:

```dotenv
VITE_CONVEX_URL=https://exuberant-cheetah-138.convex.cloud
VITE_CONVEX_SITE_URL=https://exuberant-cheetah-138.convex.site
```

O preset é Vite e o build usa Node 24. `vercel.json` define instalação com lockfile, `pnpm build`, saída `dist/app`, rotas e cabeçalhos de segurança. A Vercel publica a branch `main`. Previews devem usar um deployment de teste próprio; não atribua automaticamente acesso à base de produção.

## Sequência de atualização

1. Executar `pnpm check` no código que será publicado.
2. Publicar as funções Convex com `pnpm convex:deploy`, conferindo o destino de produção anunciado pela CLI. Mudanças no schema devem ser compatíveis com os documentos existentes.
3. Integrar e enviar `main` para o GitHub. A integração Git da Vercel constrói o portal com as variáveis de Production.
4. Conferir o commit e o estado Ready na Vercel. Validar login, autorização, calendário, subscriptions e arquivos no domínio definitivo.

A publicação do portal não publica funções Convex. Alterações nas duas partes precisam respeitar essa ordem e manter compatibilidade durante a atualização. Builds também não importam nem reinicializam dados.

## Primeira migração

A produção foi inicializada a partir de um snapshot Convex completo com Storage. Foram preservados IDs, credenciais, snapshots e metadados. Antes da importação, o destino estava vazio. Após a importação, uma nova exportação foi comparada campo a campo; veja [integridade da produção](evidencias-convex/production-integrity.json).

Os 13 PDFs originais continuam pendentes de transferência. O único arquivo disponível no Storage no momento da migração é o PDF sintético usado nos testes anteriores. Exportações privadas incluem credenciais e não entram no Git; as evidências versionadas são sanitizadas.

Para uma futura restauração, exporte com `--include-file-storage` e ensaie a importação do ZIP completo em outro deployment. Importações tabela a tabela podem quebrar referências; nunca execute uma substituição sobre produção sem conferir o conteúdo, o destino e o backup atual.
