# Publicação em produção

Os dois desenvolvedores publicam pelo mesmo fluxo, sem ambiente intermediário nem PR obrigatório. É necessário poder enviar `main` ao GitHub e administrar o projeto Convex, com papel Project Admin ou Team Admin. Cada pessoa usa sua própria conta. A publicação do portal depende da integração Git já configurada; não exige login na CLI Vercel por desenvolvedor.

## Rotina

Atualize `main`, integre as mudanças do colega e faça commit do que será publicado. A publicação exige `main` sem alterações ou arquivos novos por commitar.

```sh
pnpm deploy:production
```

O comando confere o acesso e a atualização de `main`, executa `pnpm check`, verifica o alvo Convex de produção, publica as funções e só então envia o commit conferido para `origin`. O push aciona o build e a publicação do portal pela Vercel. A conferência do alvo usa a URL fornecida pelo próprio CLI Convex antes da publicação das funções.

Para conferir o plano localmente:

```sh
pnpm deploy:production --dry-run
```

A simulação não faz chamadas remotas, não publica funções e não envia commits. Se a publicação Convex funcionar e o push ou build Vercel falhar, confira a falha antes de tentar novamente: o backend já terá sido atualizado. Mantenha mudanças compatíveis com o frontend anterior durante essa transição.

Depois da publicação, confira o commit e o estado Ready na Vercel e valide o acesso no [portal de produção](https://calendario-academico-phi.vercel.app).

## Destinos e configuração

Os alvos públicos ficam em [`config/environments.ts`](../config/environments.ts):

| Serviço         | Destino                                                                   |
| --------------- | ------------------------------------------------------------------------- |
| GitHub          | `dentec-proens/calendario-academico`, branch `main`                       |
| Convex          | Team `diretoria-de-ensino-tecnico-proens`, projeto `calendario-academico` |
| Convex produção | `exuberant-cheetah-138`                                                   |
| Vercel          | Team `dentec-proens`, projeto `calendario-academico`                      |
| Portal          | https://calendario-academico-phi.vercel.app                               |

Na Vercel, as variáveis públicas de **Production** são:

```dotenv
VITE_CONVEX_URL=https://exuberant-cheetah-138.convex.cloud
VITE_CONVEX_SITE_URL=https://exuberant-cheetah-138.convex.site
```

O preset é Vite, com Node.js 24. `vercel.json` define instalação com lockfile, `pnpm build`, saída `dist/app`, rotas e cabeçalhos. A raiz estática `index.html` contém o portal; `editor.html` contém o editor. A configuração Git permite implantação automática somente de `main`; outras branches não geram implantações automáticas quando essa configuração estiver ativa no projeto.

No Convex de produção, `SITE_URL` aponta para o portal publicado. `JWT_PRIVATE_KEY`, `JWKS` e eventuais credenciais Google ficam no ambiente Convex. O build de Production na Vercel confere as URLs Convex contra o destino versionado e falha se apontarem para outro ambiente. Desenvolvimento mantém sua própria configuração em `.env.local`; não a substitua para publicar. Nenhum segredo deve entrar no bundle Vite ou no Git.

`pnpm build` não publica funções nem inicializa dados. A publicação também não importa backups ou arquivos históricos.

## Dados preservados

A produção foi inicializada a partir de um snapshot Convex completo com Storage e teve seus IDs, credenciais, snapshots e metadados comparados após a importação. Veja [integridade da produção](evidencias-convex/production-integrity.json).

Os 13 PDFs originais permanecem pendentes. O único arquivo de Storage transferido na migração inicial foi o PDF sintético de teste. Exportações privadas podem conter credenciais e ficam fora do Git.

Uma futura restauração deve ser ensaiada em outro deployment com uma exportação completa, incluindo Storage. Ela é uma operação separada da publicação de código.
