# Operações administrativas de dados

A ferramenta `scripts/migrate-data.ts` opera sobre exportações Convex mediante plano, fingerprints, ensaio e recibos. Ela é administrativa e não participa do runtime do navegador nem das funções de negócio.

## Requisitos

- Destino explicitamente identificado e backup integral com Storage.
- Diretório privado fora do Git para ZIPs, planos, recibos e logs.
- Ensaio descartável isolado antes de qualquer aplicação em ambiente compartilhado.
- Verificação de IDs, sessões, referências, versões, pareceres, componentes e arquivos.

Exportações podem conter credenciais e dados pessoais. Não publicar seus conteúdos em logs ou artefatos de CI. Novos conteúdos e cópias de calendário usam `schemaVersion: 4`; a release A mantém validadores legados independentes somente na fronteira de armazenamento/conversão. As regras de validação e normalização pertencem ao código de domínio e ao schema.

## Migração para ofertas com identidade

O conteúdo v4 separa a identidade da oferta do tipo que determina sua aplicabilidade normativa. A release A aceita v2/v3 e v4 no armazenamento, adapta leituras em memória e grava somente v4. Um cliente antigo recebe 409 e pedido de atualização; importações de cópias 2/3 são recusadas. A release B exige somente v4 e remove os conversores. IDs, datas e vínculos dos conteúdos atuais, inclusive lixeira, são preservados; a conversão não aumenta versões nem altera `updatedAt` ou revisões da base.

A lista `pending` do componente de migrações expurga `reviewVersions`, `reviews`, `calendarVersions`, `calendarSnapshots` e `calendarAliases`, converte conteúdos em lotes de dez e materializa `calendars.offerKinds`. Recibos e contadores próprios registram convertidos, pendentes, órfãos e falhas sem varreduras integrais por consulta. Auditorias de sistema conservam contagens do expurgo e hash do estado anterior de cada calendário. Erros de dados bloqueiam a promoção; a série permite retomada segura após correção.

Publicação exige backup integral com Storage restaurado em destino descartável, ensaio A/B, verificação independente pelo domínio e painel unânime. Os procedimentos estão em [Implantação e operação](implantacao-convex-vercel.md); o estado efetivamente executado, contagens e limites ficam no [diário de ofertas v4](execucao-ofertas-v4.md). A implementação na branch não comprova que uma operação foi executada em produção.

## Fluxo da ferramenta

```sh
pnpm migrate:data plan --snapshot backup-dados/original.zip --out backup-dados/plan.json
pnpm migrate:data prepare --plan backup-dados/plan.json --out backup-dados/rehearsal
```

`plan` produz o digest, fingerprints e lotes; `prepare` constrói o projeto isolado de execução. Planos vazios representam conferência e não devem iniciar uma aplicação.

Depois de restaurar o ZIP integral em um backend descartável e conferir sua identidade, aplicar com digest explícito e verificar o próprio destino:

```sh
pnpm migrate:data apply --plan backup-dados/plan.json --deployment local --project backup-dados/rehearsal --confirm DIGEST_DO_PLANO
pnpm migrate:data verify --plan backup-dados/plan.json --snapshot backup-dados/after.zip --deployment local --project backup-dados/rehearsal --out backup-dados/receipt.json
pnpm migrate:data finish --plan backup-dados/plan.json --deployment local --project backup-dados/rehearsal --receipt backup-dados/receipt.json
```

As identidades `local`, portas e credenciais pertencem ao ambiente descartável preparado. Não inferir que um destino é descartável por seu nome. `apply` confere a fonte novamente; qualquer divergência exige plano e ensaio próprios. Produção exige o recibo verificado correspondente ao plano e ao schema em outro deployment, além da conferência explícita do destino.

## Verificação e recuperação

Conferir conteúdo, contagem, referências, snapshots, análises, texto dos pareceres, Storage e namespaces de componentes. Preservar o ZIP sem edição manual. Uma falha de fingerprint, arquivo, schema ou referência bloqueia a reabertura; não remover registros ou relaxar validações para aprovar o plano.

A publicação de código não executa a ferramenta nem importa dados. A recuperação integral usa dados e código correspondentes; dados produzidos após a reabertura exigem conciliação antes de restaurar um backup. Manter recibos e evidências em local privado.

Comandos de desenvolvimento e validação ficam em [Verificação](verificacao.md); os controles de manutenção e publicação ficam em [Implantação e operação](implantacao-convex-vercel.md).

## Retirada do calendário anterior

A migração foi ensaiada, aplicada e verificada em produção em 27/10/2026. Foram retirados os PDFs de calendários anteriores, suas análises e os vínculos de procedência. Calendários, versões, fontes textuais, documentos institucionais e exportação PDF foram preservados.

O planejador específico, o modo de publicação contract e seus comandos de execução foram removidos após a conclusão. Backups, planos, journals e recibos permanecem nos diretórios privados `backup-*`, fora do Git. O schema conserva somente a leitura dos recibos contract já gravados; não há mais funções para iniciar ou retomar essa migração. O código exato usado na operação permanece recuperável pelo histórico do Git.

Para uma nova operação administrativa, preparar um plano próprio e conferir os destinos. Não reaplicar planos ou executar scripts de uma retirada já concluída.

## Retirada das fontes manuais do calendário

A limpeza de dados foi concluída em produção em 28/10/2026: foram removidos 38.941 campos manuais do estado atual e das versões históricas, incluindo calendários na lixeira. A verificação final abrangeu 1.212 estados, com contagens e prazos equivalentes, referências institucionais preservadas e conferência integral dos demais namespaces e arquivos. A manutenção foi encerrada e a reserva exclusiva liberada.

A operação retirou somente `weekEvidence`, `teacherVacations.evidence`, `events[].evidence`, `events[].deadlineAdjustment.evidence`, `scopeConfirmation.source` e `intakeByModality[*][*].source`. Documentos, eventos institucionais, fontes automáticas de revisão, texto livre dos pareceres e PDFs institucionais permaneceram preservados. Os PDFs temporários dos testes seguiram seu ciclo normal de expiração antes da cópia definitiva.

Backups integrais, planos, projeções, journals e recibos permanecem fora do Git, em diretórios privados com permissão `700` e arquivos `600`. A implementação da limpeza está preservada no histórico do commit `c70c378`; os executores temporários e a ponte de saída foram retirados do código corrente. Não reaplicar planos antigos nem restaurar automaticamente esses backups sobre dados posteriores.

Como nenhum dos seis campos permanece nos dados, o schema estrito que os retira é publicado pela [release](implantacao-convex-vercel.md#publicação) comum; a validação de schema do Convex recusaria o deploy se algum documento ainda os contivesse.

## Verificação administrativa de dados efêmeros

Os leitores de snapshots e as provas de integridade úteis a outras operações ficam em `scripts/administration/`. A leitura confere todos os namespaces, registries, metadados e bytes de Storage. Reconciliações limitadas são explicitamente vinculadas aos planos e relatórios; não significam igualdade literal de dados efêmeros nem demonstram autoria apenas pela comparação de exports.

O ciclo de presença é conferido somente nas tabelas e campos inventariados da versão instalada, preservando identidades e dados estáveis. A implementação de autenticação continua renovando credenciais de sessões existentes durante a manutenção. Uma comparação de exports antes e depois de uma manutenção precisa tratar essas renovações como esperadas.

Antes de congelar uma cópia para uma operação, conferir callbacks de arquivos pendentes. Tickets e PDFs efêmeros podem expirar durante a manutenção; concluir seu ciclo normal antes do backup evita confundi-lo com mudanças da operação. Os demais arquivos continuam sujeitos à comparação estrita. Divergência não coberta por uma prova explícita exige investigação, sem alterar os hashes de um plano já ensaiado.
