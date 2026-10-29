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
