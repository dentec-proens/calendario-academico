# Implantação e operação

## Ambientes configurados

| Serviço                   | Destino                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------- |
| Repositório               | `dentec-proens/calendario-academico`, branch `main`                                |
| Convex                    | Team `diretoria-de-ensino-tecnico-proens`, projeto `calendario-academico`          |
| Convex de desenvolvimento | `oceanic-gazelle-652`                                                              |
| Convex de produção        | `exuberant-cheetah-138`                                                            |
| Vercel                    | Team `dentec-proens`, projeto `calendario-academico`                               |
| Portal                    | [calendario-academico-phi.vercel.app](https://calendario-academico-phi.vercel.app) |

Estes são os destinos registrados para o projeto, não uma verificação de disponibilidade dos serviços. Confira o destino efetivo na CLI e no painel antes de publicar ou restaurar dados.

## Configuração

O desenvolvimento usa `.env.local`, criado pelo CLI Convex; `.env.example` lista as variáveis públicas e a porta. Na Vercel, as variáveis de Production são:

```dotenv
VITE_CONVEX_URL=https://exuberant-cheetah-138.convex.cloud
VITE_CONVEX_SITE_URL=https://exuberant-cheetah-138.convex.site
```

No Convex de produção, `SITE_URL` deve apontar para `https://calendario-academico-phi.vercel.app`. `JWT_PRIVATE_KEY`, `JWKS` e credenciais dos provedores pertencem exclusivamente ao ambiente Convex. Cada ambiente tem sua própria configuração de autenticação. Nunca use prefixo `VITE_` em segredos.

`vercel.json` define instalação com lockfile, `pnpm build`, saída `dist/app`, rotas e cabeçalhos de segurança. O runtime de build é Node 24. A integração Git publica a branch `main`. Previews devem usar um deployment Convex de teste próprio; a URL do frontend não isola os dados do backend.

## Publicação

1. Executar `pnpm check` no código a publicar.
2. Se houver alterações do backend, publicar com `pnpm convex:deploy`, conferindo o destino anunciado pela CLI. Mudanças de schema e funções precisam manter compatibilidade com dados existentes e com o frontend durante a atualização.
3. Integrar e enviar `main` ao GitHub para a integração Vercel construir o frontend.
4. Conferir o commit e a conclusão do deployment. Validar login, autorização, abertura de calendários, sincronização e arquivos. Escritas de teste devem usar o ambiente descartável.

O build e a publicação Vercel não publicam funções Convex nem inicializam dados. `pnpm dev` prepara e acompanha o backend de desenvolvimento; não deve ser apontado casualmente para produção.

## Backup e restauração

O backup deve incluir a exportação completa do Convex e o Storage quando houver arquivos, usando a opção `--include-file-storage`. Guardar exportações em local privado: elas podem conter credenciais e dados pessoais e não devem ser versionadas no Git.

Ensaiar a restauração completa em outro deployment antes de operar sobre produção. Conferir destino, conteúdo, referências entre documentos e disponibilidade dos arquivos. Importações isoladas de tabelas podem quebrar relações. Não substituir dados de produção sem backup atual e conferência explícita do destino.

## Arquivos indisponíveis

A pendência conhecida de transferência de 13 PDFs originais não foi resolvida pela atualização de código. Metadados e análises cadastradas não comprovam que os bytes estejam no Storage. Quando um desses arquivos estiver indisponível, preservar sua referência e providenciar o original pelo procedimento autorizado, sem recriar dados estruturados ou substituir o arquivo por uma amostra.
