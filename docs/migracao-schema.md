# Operações administrativas de dados

As verificações administrativas em `scripts/administration/` operam sobre exportações Convex, com projeções independentes, fingerprints e recibos. Elas não participam do runtime do navegador nem das funções de negócio.

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

Após a confirmação da release A em produção, o estreitamento da release B exige
formato 4 tanto no conteúdo atual quanto nos snapshots históricos e torna
`calendars.offerKinds` obrigatório. São retirados os conversores v2/v3, os
validadores legados, as adaptações de leitura e a barreira 409 específica de
gravações antigas; `pending` fica vazio. A validação de schema do Convex recusa a
publicação se algum documento ainda depender da representação anterior.

`legacyStageCount` continua sendo uma representação v4 válida da quantidade
conhecida com organização pendente, com as restrições do plano. A política de
2026, os tipos de registro e os vínculos de requisitos antigos são retirados
somente conforme o inventário real do M9. Os snapshots institucionais conservam
tipos normativos em `modalities`; seu escopo é resolvido por `offer.kind`, sem
reintroduzir esse campo nos eventos locais do formato 4.

A mutação interna temporária de exclusão do resíduo foi introduzida em B
exclusivamente para a operação auditada de M9. A execução confere IDs, versão,
trabalho posterior e vínculos, preserva campus ligado a usuários ou outros
calendários e não apaga arquivos ou auditorias. No estado final de M9, o executor,
seus testes e o inventário específico do resíduo são retirados; o evento
`PURGE_RELEASE_RESIDUE` permanece em `audit`. Os recibos da execução e da
conferência ficam registrados no diário, sem uma ferramenta administrativa
permanente para repetir a exclusão.

## Verificação e recuperação

Conferir conteúdo, contagem, referências, snapshots, análises, texto dos pareceres, Storage e namespaces de componentes. Preservar o ZIP sem edição manual. Uma falha de fingerprint, arquivo, schema ou referência bloqueia a reabertura; não remover registros ou relaxar validações para aprovar o plano.

A recuperação integral usa dados e código correspondentes; dados produzidos após a reabertura exigem conciliação antes de restaurar um backup. Manter recibos e evidências em local privado.

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

## Limpeza de legado de ofertas

A preparação de M9 retira a política de 2026 e sua decisão operacional própria, os tipos especiais de registro e o redirecionamento de URLs anteriores aos IDs nativos. Datas reais anteriores ao ano continuam admitidas como notas informativas, conforme as mesmas regras temporais. A redução de etapas conserva os registros desvinculados, seus IDs e datas.

As ferramentas de importação e conversão v1/v2, seus comandos, testes próprios e dependências exclusivas foram retirados porque o verificador atual em `scripts/administration/` é independente delas. A fonte exata permanece no histórico do Git; oráculos e fingerprints publicados continuam imutáveis.

A quantidade histórica de etapas com organização pendente permanece no contrato v4: o ensaio encontrou 26 ofertas em 14 calendários, com distribuição 2/3/4 de 11/4/11. O inventário inclui conteúdos correntes, lixeira, órfãos e snapshots históricos. Os vínculos legados ainda usados pela política de 2027 também permanecem.

O inventário de produção após a release A confirmou ausência de calendários até 2026 e de tipos especiais de registro, incluindo o histórico. Permanecem 26 marcadores de quantidade de etapas e 59 vínculos de requisitos legados. O estado final de M9 também retira a descoberta específica do resíduo depois da exclusão auditada; a execução e sua conferência são registradas no diário pelo responsável pela operação.

## Presencial e lixeira — 30/10/2026

A migração `initializePresencialAndPurgeTrash20261030` preenche com `presencial`
as ofertas ainda `a-conferir` dos calendários ativos existentes na autorização.
Conserva ofertas já classificadas, arquiva o estado anterior e avança a versão,
para que um editor aberto não sobrescreva a alteração silenciosamente.

Na mesma operação, remove calendários já na lixeira e seus conteúdos. A
conferência de produção encontrou 35 calendários nessa condição, sem versões
ou pareceres associados; a migração recusa a exclusão se encontrar esses
vínculos inesperados. Campi, usuários, documentos, arquivos e auditorias
anteriores são preservados. Uma auditoria registra cada preenchimento ou
exclusão. O limite temporal fixo protege calendários criados ou enviados à
lixeira depois da autorização; o componente de migrações registra a conclusão.

O backup integral com Storage foi restaurado e comparado num backend local
privado. O ensaio processou 74 calendários: 66 ofertas preenchidas em 38
calendários, 35 itens da lixeira removidos e 39 calendários restantes. As provas
ficam fora do Git em `/Users/gustavo/work/operacao-calendarios-20261030/`.
A publicação inclui o redesenho da etapa 2 integrado em `main` (`4f0a27b`).

Validação anterior à publicação: três testes dirigidos da manutenção, ensaio
completo com a cópia restaurada de produção e `pnpm check` aprovado em 231,1 s,
incluindo 311 testes de navegador, desktop/mobile e impressão. A comparação do
ensaio conferiu os estados anteriores arquivados, o delta exato e o Storage.

**Concluído em produção:** release `250b3039`, deployment
`dpl_7bc3BnsoXQSj2smpkn9JtpCuGSgD`. A migração concluiu os 74 documentos e a
verificação posterior confirmou 66 ofertas preenchidas em 38 calendários,
35 calendários e respectivos conteúdos removidos da lixeira e 39 restantes.
Os estados anteriores dos calendários alterados foram arquivados; históricos
anteriores, pareceres, usuários, campi, documentos e Storage permaneceram
intactos. A comparação conferiu todas as tabelas; o ciclo normal de presença
foi reconciliado separadamente. O redesenho da etapa 2 foi promovido na mesma
release. O backup automático imediatamente anterior ao backend está em
`/Users/gustavo/work/backups-calendario/release-250b3039-ZvF1BB/`, SHA-256
`3384c5d61e61a06fb60c82faf6ae81e9e6ff8bc0b32756e48851b98cc5b80a0d`.

## Observâncias de 2027 — preparação

As escolhas locais passam de `teacherDayDate` para
`observanceDates['teacher-day']`. A observância do Dia do Servidor Público
pode ser escolhida em 28 ou 29/10/2027; a migração não cria escolhas desse
evento e conserva todas as escolhas do Professor, inclusive datas explícitas
iguais à referência institucional.

As migrações `migrateContentObservances20261030` e
`migrateSnapshotObservances20261030` convertem conteúdos atuais e snapshots
históricos. A conversão é idempotente, recusa conflitos entre os dois campos
e não recalcula períodos, eventos ou contagens. Versões dos calendários,
`updatedAt`, revisões da base, `rulesetVersion`, pareceres e vínculos são
preservados.

A publicação ocupa uma janela de manutenção com bloqueio de gravações,
backup integral com Storage, expansão do schema, migração, conferência e
contração do schema. As duas releases usam `pnpm deploy:production
--maintenance SHA_DA_JANELA`, conforme [Implantação e operação](implantacao-convex-vercel.md).
O mapa novo é o único formato da aplicação; o campo antigo permanece
temporariamente apenas no schema de armazenamento e no conversor da migração.

O inventário inicial encontrou 39 calendários, 109 snapshots, dois conteúdos
e dois snapshots com o campo antigo e um arquivo em Storage. A exportação
completa foi restaurada em backend local privado e comparada integralmente,
com todas as tabelas e os bytes de Storage equivalentes. O ensaio da migração
conferiu 64 tabelas, os dois recibos esperados e somente as quatro conversões
de campo. A comparação entre o código anterior e o novo abrangeu 148 estados:
97 contagens equivalentes e 51 estados incompletos com a mesma validação. Evidências e backups
ficam fora do Git, em `/Users/gustavo/work/operacao-observancias-20261030/`.
Este inventário não comprova a execução em produção; o resultado será
registrado após a operação.

Validação da expansão: `pnpm check` aprovado em 243,4 s, incluindo os 335
testes de navegador, desktop/mobile e impressão Chromium. O schema estrito
também foi publicado e validado no backend isolado após a migração, com
Storage e os demais dados preservados.
