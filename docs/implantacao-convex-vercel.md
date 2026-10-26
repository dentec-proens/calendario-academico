# Implantação e operação

Os dois desenvolvedores publicam pelo mesmo fluxo, sem ambiente intermediário nem PR obrigatório. É necessário poder enviar `main` ao GitHub e administrar o projeto Convex, com papel Project Admin ou Team Admin. Cada pessoa usa sua própria conta; a integração Git existente dispensa login na CLI Vercel por desenvolvedor.

## Ambientes configurados

| Serviço                    | Destino                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Repositório                | `dentec-proens/calendario-academico`, branch `main`                                |
| Convex                     | Team `diretoria-de-ensino-tecnico-proens`, projeto `calendario-academico`          |
| Desenvolvimento de Gustavo | `oceanic-gazelle-652`                                                              |
| Convex de produção         | `exuberant-cheetah-138`                                                            |
| Vercel                     | Team `dentec-proens`, projeto `calendario-academico`                               |
| Portal                     | [calendario-academico-phi.vercel.app](https://calendario-academico-phi.vercel.app) |

Os destinos públicos ficam em [`config/environments.ts`](../config/environments.ts). Cada desenvolvedor tem seu próprio desenvolvimento; `oceanic-gazelle-652` é o já configurado por Gustavo. Esta relação não é uma verificação de disponibilidade dos serviços. Confira o destino efetivo na CLI e no painel antes de publicar ou restaurar dados.

## Configuração

O desenvolvimento usa `.env.local`, preparado por `pnpm dev:setup`; `.env.example` lista as variáveis públicas e a porta. Esse arquivo é individual e não precisa mudar para publicar. Veja [Desenvolvimento](desenvolvimento.md). Na Vercel, as variáveis de Production são:

```dotenv
VITE_CONVEX_URL=https://exuberant-cheetah-138.convex.cloud
VITE_CONVEX_SITE_URL=https://exuberant-cheetah-138.convex.site
```

No Convex de produção, `SITE_URL` deve apontar para `https://calendario-academico-phi.vercel.app`. `JWT_PRIVATE_KEY`, `JWKS` e credenciais dos provedores pertencem exclusivamente ao ambiente Convex. Cada ambiente tem sua própria configuração de autenticação. Nunca use prefixo `VITE_` em segredos.

`vercel.json` define instalação com lockfile, `pnpm build`, saída `dist/app`, rotas e cabeçalhos de segurança. O runtime de build é Node 24. `index.html` e `portal.html` contêm o portal; `editor.html` contém o editor. As regras encaminham URLs como `/calendarios/novo`, `/revisoes/<id>` e `/calendarios/<id>/historico` ao documento correspondente, para que acesso direto e recarregamento funcionem. Os documentos de login, recuperação, ativação e logs também mantêm seus endereços. Caminhos desconhecidos e arquivos ausentes não recebem um fallback indiscriminado para o portal. O modelo compartilhado em `src/app-routes.ts` atende Vite e preview local; um teste confere sua equivalência com os rewrites da Vercel. A configuração Git permite implantação automática somente de `main` quando ativa no projeto. O build de Production confere as URLs Convex contra o destino versionado e falha se apontarem para outro ambiente.

## Publicação

Atualize `main`, integre as mudanças do colega e faça commit do que será publicado. A publicação exige `main` sem alterações ou arquivos novos por commitar.

```sh
pnpm deploy:production
```

O comando confere o acesso e a atualização de `main`, executa `pnpm check`, verifica o alvo Convex de produção, publica as funções e só então envia o commit conferido para `origin`. O push aciona o build e a publicação do portal pela Vercel. A conferência do alvo usa a URL fornecida pelo próprio CLI Convex antes da publicação das funções.

Para conferir o plano localmente:

```sh
pnpm deploy:production --dry-run
```

A simulação não faz chamadas remotas, não publica funções e não envia commits. Se a CLI Convex falhar, confira o estado no dashboard antes de repetir: a conexão pode falhar após o envio. Se o backend tiver sido publicado e o push ou build Vercel falhar, ele já poderá estar na versão nova. Mudanças de schema e funções precisam manter compatibilidade com os dados existentes e com o frontend durante a atualização.

Confira o commit e o estado Ready na Vercel. Valide login, autorização, abertura de calendários, sincronização e arquivos. Escritas de teste devem usar o desenvolvimento individual ou outro deployment descartável.

O build e a publicação Vercel não publicam funções Convex nem inicializam dados. A publicação de código não importa backups ou arquivos históricos.

A consolidação do banco anterior para o schema tipado exige executar primeiro o procedimento de [migração do schema](migracao-schema.md). Ele bloqueia as escritas da aplicação, exporta a fotografia final, ensaia esse plano em outro deployment e só então converte os documentos existentes. A publicação normal não substitui essa migração.

## Backup e restauração

O backup deve incluir a exportação completa do Convex e o Storage quando houver arquivos, usando a opção `--include-file-storage`. Guardar exportações em local privado: elas podem conter credenciais e dados pessoais e não devem ser versionadas no Git.

Ensaiar a restauração completa em outro deployment antes de operar sobre produção. Conferir destino, conteúdo, referências entre documentos e disponibilidade dos arquivos. Importações isoladas de tabelas podem quebrar relações. Não substituir dados de produção sem backup atual e conferência explícita do destino.

## Restauração dos originais concluída

Em 23/10/2026, os 13 PDFs originais recuperados da Supabase foram restaurados em produção (`exuberant-cheetah-138`) e no desenvolvimento de Gustavo (`oceanic-gazelle-652`). Não restaram originais indisponíveis nesses ambientes. Os bytes e os hashes foram conferidos nas exportações finais com Storage, e os downloads dos calendários ativos também foram verificados.

IDs, metadados, análises, calendários, versões e pareceres foram preservados, assim como os calendários que já estavam na lixeira. O registro da operação, as evidências privadas e o procedimento para novas restaurações estão em [Restauração dos PDFs originais](restauracao-de-originais.md).
