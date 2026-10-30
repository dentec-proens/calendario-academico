# Implantação e operação

## Destinos e configuração

Os identificadores públicos ficam em [`config/environments.ts`](../config/environments.ts). Cada desenvolvedor usa sua conta e deployment individual. Produção usa o Convex `exuberant-cheetah-138` e o portal [calendario-academico-phi.vercel.app](https://calendario-academico-phi.vercel.app), no projeto Vercel `dentec-proens/calendario-academico`. O repositório é `dentec-proens/calendario-academico`, branch de publicação `main`.

O desenvolvimento usa `.env.local`, preparado por `pnpm dev:setup`. Na Vercel, Production usa:

```dotenv
VITE_CONVEX_URL=https://exuberant-cheetah-138.convex.cloud
VITE_CONVEX_SITE_URL=https://exuberant-cheetah-138.convex.site
```

`SITE_URL`, `JWT_PRIVATE_KEY`, `JWKS` e credenciais dos provedores pertencem ao ambiente Convex. Nunca use prefixo `VITE_` em segredo. Cada ambiente tem configuração de autenticação própria.

Vite gera `dist/app/index.html` e chunks. Vite, preview e Vercel encaminham somente os caminhos conhecidos do produto para essa entrada. `vercel.json` mantém headers de segurança, instalação com lockfile e build Node 24. O build Production confere as URLs Convex contra o destino versionado.

## Publicação

`pnpm deploy:production` é o único fluxo de release, deploy ou publicação em produção. Ele constrói um candidato Production sem domínio público, exporta os dados quando o backend mudou, publica o Convex, conclui as migrações pendentes e só então promove o candidato. Não executa `pnpm check`, testes ou smoke: essa validação pertence ao desenvolvimento, antes do commit. Não entra em manutenção, não encerra sessões e não restaura dados automaticamente.

Pré-requisitos:

- Checkout na branch `main` (integre antes a branch de trabalho, por exemplo com `git merge --ff-only`), `origin` correto e permissão de push fast-forward e de reservar `codex/production-release-lock`. A árvore de trabalho pode conter alterações locais; elas não entram na release.
- Conta administrativa Convex; nenhum seletor alternativo de deployment. `operations:status` deve estar disponível e sem manutenção.
- Conta Convex com login (`pnpm exec convex login`); sem ela, o comando para antes de reservar e indica o login.
- `.vercel/release.env` com `VERCEL_TOKEN` e `DENTEC_RELEASE_BACKUP_DIR` (abaixo). O comando lê esse arquivo sozinho e, se ele faltar ou estiver incompleto, mostra os passos exatos de configuração. Segredos nunca entram em argumentos, logs ou Git.

### Credenciais locais em `.vercel/`

A pasta `.vercel/`, ignorada pelo Git e de acesso restrito ao usuário, guarda o estado local de operação. Não copie seu conteúdo para issues, logs, argumentos de comando ou commits.

- `release.env`: `VERCEL_TOKEN` e `DENTEC_RELEASE_BACKUP_DIR` da release, com permissão `600`. Use um token de acesso dedicado, criado em [Account Settings → Tokens](https://vercel.com/account/tokens) com escopo da equipe `dentec-proens` e do projeto `calendario-academico` e com expiração definida. Se a promoção do domínio for recusada com escopo de projeto, crie o token com a equipe e **All Projects**. O valor começa com `vcp_` e é mostrado uma única vez. `DENTEC_RELEASE_BACKUP_DIR` é uma pasta existente, absoluta, fora do repositório e com permissão `700`, porque o backup contém dados e sessões; ela é exigida sempre, para que uma release com backend alterado não descubra a falta no meio do caminho.
- `project.json`: vínculo do diretório ao projeto e à equipe na Vercel (`projectId`, `orgId`). Não é credencial.
- `cli/auth.json`: sessão da CLI da Vercel, quando criada com `vercel login --global-config .vercel/cli`. Expira em poucas horas; não a use como credencial de release.

Não guarde o `VERCEL_TOKEN` no `.env.local`. Esse arquivo seleciona o deployment Convex de desenvolvimento, é reescrito por `pnpm dev:setup` e por `vercel env pull`, e carregá-lo inteiro exportaria destinos de desenvolvimento para o processo da release.

`pnpm deploy:production` carrega `.vercel/release.env` a cada execução, sem `source` no terminal. O arquivo só aceita as duas variáveis acima; outra chave, permissão aberta, pasta de backup inválida ou valor diferente já exportado no shell interrompem o comando antes de qualquer operação. O token fica no processo da release e não é repassado a Git, pnpm ou Convex CLI.

```sh
pnpm deploy:production --dry-run
pnpm deploy:production
```

`--dry-run` confere `.vercel/release.env` e mostra os destinos e a ordem das etapas, sem subprocessos nem chamadas remotas. Uma recusa 401/403 da Vercel indica token vencido ou sem escopo: crie outro e atualize o arquivo. A execução:

1. Fixa o HEAD da branch de origem e cria um worktree temporário detached desse SHA. Fontes, configuração de destino e módulos operacionais são lidos do snapshot; as dependências são instaladas nele com lockfile congelado e sem scripts de instalação. Não há stash, reset, commit automático ou alteração do índice original. Para incluir mudanças locais, faça o commit antes de iniciar a release.
2. Confere destinos versionados, `origin`, que o SHA descende de `origin/main` e do commit servido no domínio público. Compara os arquivos alterados desde esse commit para decidir se o backend mudou (`convex/`, `src/`, `config/`, runtime de impressão e dependências).
3. Confere pelos metadados da Convex CLI que o destino é a produção e que não há manutenção. O destino é fixado em arquivo temporário explícito; tokens não são enviados como argumentos.
4. Reserva a release por referência Git com `force-with-lease` esperando ausência. Confere que o domínio continua no deployment anterior, desativa e confirma a atribuição automática de domínios (`vercel.json` também desativa auto-deploy por push), envia o SHA para `main` e aguarda o candidato Production READY.
5. Se o backend mudou, exporta os dados com Storage, confere o ZIP e grava seu SHA-256 e recibo em uma subpasta privada de `DENTEC_RELEASE_BACKUP_DIR`.
6. Publica o Convex com o typecheck e a validação de schema padrão da CLI. O deploy usa `--codegen disable` para preservar os arquivos gerados do commit; mantenha-os atualizados durante o desenvolvimento. Um hook confere a URL resolvida antes da publicação. O Convex recusa um schema que os documentos existentes violem.
7. Inicia `migrations:start` e acompanha `migrations:status` até todas as migrações pendentes terminarem com sucesso. Falha, cancelamento ou prazo de 20 minutos interrompem a release antes da promoção.
8. Promove exatamente o candidato construído, confirma seu ID no domínio e libera a reserva com a identidade exata.

Releases apenas de frontend também publicam o Convex do mesmo commit, sem mudança efetiva, e dispensam o backup. Push ou build isoladamente não autorizam promoção. A reserva protege execuções cooperantes deste comando; mudanças administrativas externas exigem reconciliação.

## Migrações de dados

Alterações de dados históricos usam o componente [`@convex-dev/migrations`](https://www.convex.dev/components/migrations), montado em `convex/convex.config.ts`. As migrações ficam em [`convex/migrations.ts`](../convex/migrations.ts) e a lista `pending` define, em ordem, o que a próxima release deve executar. O componente processa lotes de forma assíncrona, registra o cursor, ignora migrações já concluídas e retoma uma interrompida de onde parou.

Uma mudança de schema que exige migrar dados ocupa duas releases:

1. **Alargar.** O schema aceita o formato antigo e o novo (campo novo opcional, união dos dois tipos ou campo a remover marcado como opcional) e o código lê e grava os dois. Defina a migração e inclua-a em `pending`:

   ```ts
   export const fillCampusLabel = migrations.define({
     table: 'campuses',
     migrateOne: (_ctx, campus) =>
       campus.label === undefined ? { label: campus.name } : undefined,
   });

   const pending: MigrationFunctionReference[] = [internal.migrations.fillCampusLabel];
   ```

   A release faz o backup, publica o schema alargado e conclui a migração antes de promover o frontend.

2. **Estreitar.** Com a migração concluída, o schema e o código passam a exigir somente o formato novo; remova a definição de `pending`. Se algum documento ainda violar o schema, o próprio Convex recusa o deploy, antes da promoção.

Antes de publicar uma migração que altera ou remove valores existentes, teste-a no deployment de desenvolvimento e, se o risco justificar, restaure o último backup em um deployment descartável e execute-a lá. `npx convex run migrations:run '{"fn":"migrations:fillCampusLabel","dryRun":true}'` executa um lote e desfaz o resultado. O progresso pode ser acompanhado com `npx convex run --component migrations lib:getStatus --watch`. Conversões que não cabem em lotes por documento, como reescritas entre tabelas ou importações completas, exigem um plano próprio conforme [Operações administrativas de dados](migracao-schema.md).

## Falhas e recuperação

Falhas antes do deploy do Convex não alteram o backend nem o domínio; a saída indica quando nenhum serviço foi tocado. Depois do deploy, a falha preserva a reserva e o estado efetivamente publicado, sem rollback automático:

- **Deploy ou migração:** o backend pode já estar no commit novo e o domínio continua no frontend anterior, que precisa ser compatível com o schema alargado. Corrija a causa, libere a reserva e repita a release; migrações concluídas são ignoradas e as interrompidas retomam do último lote. Consulte o erro de uma migração com `lib:getStatus`.
- **Promoção:** o domínio pode já ter mudado. Confira na Vercel o deployment servido antes de repetir.

Depois de conferir, verificar `git ls-remote origin refs/heads/codex/production-release-lock` e remover **somente o proprietário conferido** com `git push --force-with-lease=refs/heads/codex/production-release-lock:SHA_DA_RESERVA origin :refs/heads/codex/production-release-lock`. Nunca usar força sem condição de identidade. Para recuperar o frontend, promover apenas um deployment anterior compatível com o backend instalado e que contenha o histórico de arquivos (ver abaixo); não reconstruir um commit antigo presumindo equivalência de ambiente. Restaurar o backup é uma decisão manual: dados criados após a release seriam perdidos.

## Manutenção

A manutenção é confirmada no backend. `operationalControl` identifica o commit responsável, e `operationalLeases` mostra actions aceitas que ainda não concluíram. A configuração emergencial `DENTEC_MAINTENANCE=1` também bloqueia novas alterações. Não considerar o tempo decorrido como término de uma action.

Os controles de manutenção permanecem disponíveis para intervenção planejada e recuperação de janelas anteriores. A release não os aciona e, por padrão, recusa publicar enquanto houver manutenção ativa.

Para executar as duas releases de uma migração durante uma única manutenção planejada, pause antes com `operations:pause`, usando o SHA completo do commit responsável pela janela, e confira `operations:status`. Publique por `pnpm deploy:production --maintenance SHA_DA_JANELA`, tanto na expansão quanto na contração. A opção exige o mesmo proprietário, manutenção ativa, ausência de bloqueio emergencial e nenhuma action em andamento; essas condições são reconferidas antes do backend e da promoção. O comando mantém a manutenção ativa após concluir. O SHA da janela permanece o mesmo nas duas publicações, mesmo quando o commit publicado muda. Depois de conferir dados, contratos e domínio, reabra com `operations:resume` e o SHA original. Não usar essa opção para assumir uma manutenção de outro proprietário. Uma falha após uma pausa explícita mantém o bloqueio. Uma resposta perdida da CLI pode ocorrer após o commit da pausa; conferir o estado também nesse caso. Conferir o estado pelo destino explícito, por exemplo:

```sh
pnpm exec convex run operations:status '{}' --deployment exuberant-cheetah-138 --codegen disable
```

Antes de liberar, conferir o commit que possui a janela, as operações ativas, os contratos Convex, o deployment Ready e o domínio Vercel. Uma falha de conexão durante publicação pode ocorrer após o envio; consultar o destino antes de repetir. Se uma action foi interrompida sem liberar o lease, comprovar sua conclusão na plataforma e tratar o lease por procedimento administrativo revisado. Não apagar leases automaticamente por idade.

Cada action registra `Operational lease`, o ID do lease e sua operação no próprio log de execução. Para um lease pendente, localizar esse registro e conferir o evento terminal da mesma execução no Convex. Somente após comprovar o término, a função interna `operations:finish` pode receber o ID exato desse lease. Sem evento terminal ou prova da plataforma, manter o bloqueio e investigar; não inferir que a action terminou por ter ultrapassado uma duração esperada.

Se a falha aconteceu antes de qualquer tentativa de deploy, os contratos não foram substituídos. Depois de confirmar `operations:status` sem leases ativos e a janela do mesmo commit, `operations:resume` com esse commit reabre o acesso. Se houve tentativa de deploy com resultado incerto, conferir os dois artefatos antes de liberar.

O inventário da aplicação preserva os callbacks de `nativeFiles`. O componente de presença mantém sua versão fixada e seu ciclo próprio: heartbeat e disconnect continuam disponíveis durante manutenção e não alteram calendários, documentos ou acessos. Uma atualização desse componente exige conferir também seus jobs com `convex data _scheduled_functions --component presence` e `--component presence/batchWorker`, além de seu contrato de atualização; não está coberta por presumir que o inventário da aplicação inclui componentes.

A recuperação confere as revisões efetivamente instaladas de backend e frontend e mantém seus contratos compatíveis, IDs e dados. Importar backup exige análise específica: dados criados após a reabertura não podem ser descartados por um rollback automático. Depois de um período de manutenção, a função interna `nativeFiles:cleanupExpired` remove temporários vencidos em lotes e preserva arquivos consumidos.

## Backup e arquivos

Exportar Convex completo com `--include-file-storage` quando houver PDFs. Manter ZIP, recibos e credenciais em local privado, fora do Git. Ensaiar restauração integral em um deployment descartável antes de operar sobre dados compartilhados; importação isolada de tabelas pode quebrar referências.

A aplicação repõe um PDF indisponível pelo fluxo [Restaurar original](restauracao-de-originais.md), com conferência de hash. Operações sobre exportações usam a [ferramenta administrativa de dados](migracao-schema.md).

Os testes remotos exigem opt-in de deployment descartável ou do desenvolvimento atual autorizado, com destino verificado e registros exclusivos da suíte conforme a [Verificação](verificacao.md). Produção não recebe E2E. A release não executa `pnpm check`; ele é a validação obrigatória do desenvolvimento, antes do commit.

## Registro da retirada de calendários anteriores

A retirada foi concluída em produção em 27/10/2026, com ensaio descartável, backup integral, manutenção, verificação dos dados e smoke do candidato antes da promoção. A manutenção foi encerrada e a reserva exclusiva liberada.

O executor temporário contract foi removido, sem comandos para repetir a retirada.

Backups, planos, journals e recibos da operação continuam preservados em diretórios privados `backup-*`. Não executar novamente esses artefatos contra um banco já migrado. O procedimento administrativo geral está em [Operações administrativas de dados](migracao-schema.md).

Os recibos de release (`releaseProgress`, `releaseReceipts` e `releaseMigrationDefinitions`) foram retirados do schema junto com o fluxo de expansão. Depois da primeira release sem eles, as tabelas permanecem no banco sem validação; exporte-as se quiser preservar o histórico e apague-as pelo dashboard do Convex.

## Identidade e passagem de versão no navegador

Cada invocação de build Vite gera uma identidade opaca, embutida no cliente e no `dist/app/version.json`. A mesma identidade acompanha o candidato promovido; não há anúncio antecipado no Convex nem mudança no procedimento de release. `/version.json` é JSON sem cache de navegador/CDN. O preview revalida o HTML estático em cada acesso, sem cache longo, como o domínio público observado; somente o shell público pode participar do cache de voltar/avançar do navegador. A observação no domínio canônico muda somente com sua promoção ou rollback. Comparar diferença de identidade permite reconhecer também o retorno a uma versão anterior.

A consulta é um sinal de disponibilidade, não uma prova de compatibilidade de backend nem autorização de descarte. A aplicação atualiza automaticamente somente num clique elegível do menu principal, com observação recente e trabalho resolvido na própria aba. A atualização manual usa a mesma proteção e consulta novamente o manifesto. Não há sincronização de rascunhos ou autorização de outra aba.

### Continuidade dos arquivos entre publicações

A investigação de 28/10/2026 confirmou 404 no domínio canônico para `IssuesSection-B9uAbh8l.js` e o CSS do editor da publicação anterior, enquanto os equivalentes atuais responderam 200. Isso interrompe abas abertas antes de uma publicação quando elas navegam para uma seção ainda não carregada. O aviso preserva o editor, mas repetir um endereço removido não recupera o arquivo.

O plugin `scripts/frontend-assets.ts`, usado também por builds diretos do Vite, gera `/asset-history.json` com caminho, tamanho e SHA-256 de todos os arquivos públicos de `/assets/`. No build Production da Vercel, lê o inventário do domínio canônico e incorpora os arquivos anteriores ao novo candidato. O inventário resultante inclui o histórico herdado; publicações sucessivas conservam também versões mais antigas. Arquivos com o mesmo nome precisam ter os mesmos bytes. JavaScript, CSS, fontes, imagens e demais assets já publicados são preservados; HTML, `/version.json`, dados autenticados e formulários não são copiados. Os dois manifestos permanecem sem cache de navegador/CDN, e o HTML continua revalidado.

Na primeira adoção, o portal anterior ainda não tem inventário: o build percorre a entrada HTML, os imports e as referências com hash geradas pelo Vite, incluindo dependências transitivas, CSS e worker. Uma marca no HTML novo impede que a ausência posterior do inventário seja tratada como primeira adoção. Falhas HTTP, redirecionamentos, caminhos inválidos, colisões ou hashes/tamanhos divergentes interrompem o build. Há limites de 16 MiB por arquivo, 10 mil arquivos e 256 MiB no histórico completo; alcançar esses limites bloqueia a publicação, sem apagar versões automaticamente.

A herança ocorre durante o build remoto de toda release. As verificações de concorrência e identidade do domínio antes da promoção continuam obrigatórias. Novas abas recebem o HTML e a identidade atuais; abas existentes continuam carregando seus arquivos originais, mantendo a sessão e os preenchimentos em memória. Nenhuma atualização forçada foi adicionada. Essa continuidade depende também da compatibilidade do backend com clientes anteriores: alargue o schema antes de estreitá-lo, conforme as migrações acima.

Não promover diretamente um deployment antigo que não contenha o histórico acumulado: isso voltaria a remover arquivos usados por abas mais recentes. Uma recuperação de frontend deve produzir um candidato compatível que herde o inventário do domínio atual antes de ser validado e promovido. Remover arquivos antigos, inclusive em uma resposta a incidente, exige uma operação explícita e avaliação das abas afetadas.

A adoção foi ensaiada por leitura pública contra o portal atual, sem criar ou promover deployments. A validação local cobre A → B → C, integridade, indisponibilidade e navegação real após a troca de diretório servido em desktop/mobile: a revisão abre com 200, o evento ainda não aplicado permanece, os proprietários do editor/formulários conservam identidade e uma aba nova recebe B. A primeira publicação preservará os arquivos ainda disponíveis no momento do build; não recupera arquivos que publicações anteriores já removeram. A prova remota foi feita na release de 28/10/2026 (`7d025ee`): os 246 arquivos de `/asset-history.json`, inclusive os da versão anterior, responderam 200 no domínio canônico após a promoção.

## Correções de autenticação de outubro de 2026

A implementação descrita em [Segurança: operação e validação](seguranca.md) altera auth, schema, componentes e dependências. Ela exige janela administrativa específica e ensaio remoto autorizado antes de publicar. `pnpm deploy:production` não recusa automaticamente essa classe de alteração: não publicá-la por esse comando antes de preparar a janela. O guia lista validação de hash no runtime, ingresso de 8 MB, uploads legados, funções agendadas estáveis e contingência da conta operacional. O login Google está intencionalmente desabilitado até segundo aviso e deve permanecer assim durante a publicação; a validação dessa integração pertence a uma futura reativação explicitamente autorizada.

## Contração definitiva dos campos de fonte manual

O modo `--contract-manual-sources`, que removia os seis campos manuais do schema e dos contratos de calendário com manutenção, backup e ensaio, foi retirado junto com o fluxo de expansão. A limpeza dos dados foi concluída em 28/10/2026 (ver [Operações administrativas de dados](migracao-schema.md)), então o schema estrito é publicado pela release comum; a validação de schema do Convex recusaria o deploy se algum documento ainda contivesse esses campos.
