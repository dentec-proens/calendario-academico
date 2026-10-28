# Operações administrativas de dados

A ferramenta `scripts/migrate-data.ts` opera sobre exportações Convex mediante plano, fingerprints, ensaio e recibos. Ela é administrativa e não participa do runtime do navegador nem das funções de negócio.

## Requisitos

- Destino explicitamente identificado e backup integral com Storage.
- Diretório privado fora do Git para ZIPs, planos, recibos e logs.
- Ensaio descartável isolado antes de qualquer aplicação em ambiente compartilhado.
- Verificação de IDs, sessões, referências, versões, pareceres, componentes e arquivos.

Exportações podem conter credenciais e dados pessoais. Não publicar seus conteúdos em logs ou artefatos de CI. Novos conteúdos e cópias de calendário usam `schemaVersion: 3`; v2 permanece como formato de leitura/conversão, inclusive para os adaptadores históricos desta migração. As regras de validação e normalização pertencem ao código de domínio e ao schema.

## Conversão local de v2 para v3

A consulta preserva o conteúdo e os snapshots originais. O editor adapta v2 em memória; um salvamento válido grava v3 com a versão esperada e a incorporação explícita da política de 2027 quando necessária. A importação de cópia usa a mesma conversão e pede confirmação antes da substituição do estado aplicado. Dois salvamentos concorrentes não executam duas conversões silenciosas.

Organização anual inequívoca conserva período, ID e datas. Organização semestral exige identidade segura dos dois semestres; nomes genéricos, `misto` e configurações inconsistentes ficam `a-classificar`. A classificação não é inferida pela posição de um período em uma lista. Nenhum edital legado ganha ano de ingresso ou situação realizada pelo nome. A configuração geral antiga de ingresso é contexto; em calendário combinado, exige confirmação por oferta.

Um cliente v2 não sobrescreve conteúdo já convertido para v3. Cópias, fontes e rascunhos continuam recuperáveis para atualização do cliente. Pareceres e snapshots antigos não são reescritos; a adoção de novas regras invalida a conferência antiga, e a nova revisão identifica o conjunto efetivamente examinado. O ensaio da fonte institucional e a operação administrativa posterior estão descritos em [Arquitetura](arquitetura-convex.md#conteúdo-v3-e-política-de-2027).

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

## Remoção das fontes manuais do calendário

A retirada autorizada abrange o estado editável e todas as versões históricas, inclusive calendários na lixeira e snapshots sem vínculo. O helper puro `withoutManualSources` remove somente seis caminhos: `weekEvidence`, `teacherVacations.evidence`, `events[].evidence`, `events[].deadlineAdjustment.evidence`, `scopeConfirmation.source` e `intakeByModality[*][*].source`. Datas, IDs, escopos, confirmações e classificação de prorrogação são preservados. Um registro `inst:` ou `institutional: true` dentro do array local bloqueia a operação para reconciliação explícita; não se infere que sua fonte seja manual.

Referências institucionais automáticas permanecem nos arrays `institutionalSnapshot`, `institutionalEvents` e `documentSnapshot`, nas tabelas de catálogo/documentos e no identificador automático `reviews.source`. Não há remoção recursiva por nome de propriedade, reescrita de texto livre de pareceres ou alteração de PDFs já baixados. Os campos legados opcionais aceitos pelos validators de compatibilidade não representam valores persistidos: a normalização retira os dados manuais de novas escritas, cópias, importações e restaurações. Os contratos de saída para abas antigas são tratados separadamente da persistência. A bridge `convex/calendars/legacyDto.ts` fornece somente no retorno identificadores técnicos do registro e da versão nos slots antigos, sem reproduzir textos manuais e sem gravar esses identificadores no banco. Isso mantém o motor de contagem dos clientes anteriores funcional. Os validators conservam slots opcionais de compatibilidade; sua exclusão estrutural posterior exige uma operação contract, após avaliar clientes e jobs antigos.

### Plano específico e ensaio

A limpeza usa `scripts/manual-source-cleanup.ts` e a função interna nativa `maintenance/manualSources:applyBatch`. Não publica o backend temporário de `migrate:data prepare`, não desativa o schema e não amplia a lista de migrações aditivas do release normal. `pnpm deploy:production` continua como publicação completa de expansão compatível; a limpeza destrutiva é uma operação administrativa separada e não deve ser contornada com fast release.

Todos os caminhos do novo CLI são absolutos e privados **fora do repositório**, por exemplo uma pasta `~/.codex/backups/calendario-academico/manual-sources-ID` com permissão `700`. Backups, projeções, planos, journals e recibos usam `600`. Não publicar seus conteúdos em logs, issues ou Git. O CLI não sobrescreve backups, planos ou recibos existentes; atualiza somente o journal da mesma execução.

1. Finalizar e commitar os trabalhos concorrentes, executar a validação local e conferir o destino de produção e os contratos. Publicar a bridge compatível pelo fluxo normal. O `unchangedOnly` precisa comparar representações saneadas sem gravar diferenças apenas para satisfazer o smoke. A publicação isolada não apaga todos os valores antigos.
2. Reservar a operação, entrar em manutenção do SHA conferido sem acesso de smoke e aguardar zero leases. Exportar o banco **com `--include-file-storage`** para a pasta privada. Esse backup congelado será a origem exata do plano e do ensaio; não usar um export anterior a alterações legítimas.
3. Preservar a prova bruta pré-publicação pela implementação anterior fixada contra a nova implementação saneada. Para o backup final, após publicar a bridge, gerar a projeção antiga com `scripts/manual-source-projection.ts --legacy-wire` e o checkout anterior em `--code-root`; esse modo fornece ao motor antigo o mesmo DTO efetivamente recebido pelas abas anteriores, usando calendário e versão reais e conferindo a invariância dos demais campos. Gerar a projeção nova com `--strip-manual` e o checkout novo. Não usar fallback condicionado a erro nem substituir a prova bruta anterior pela prova do contrato. Cada JSON deve conter `{sourceSha256: SHA256_DO_ZIP_ORIGINAL, states: {"calendarContents:ID": RESULTADO, "calendarSnapshots:ID": RESULTADO}}`. Incluir todas as chaves, inclusive estados que legitimamente não permitem cálculo. Os resultados devem preservar contagens, ledger geométrico e datas de prazos; fontes textuais removidas não fazem parte da projeção.
4. Preparar o plano. Ele vincula SHA-256 do ZIP, schema, commit, projeção, fingerprints completos de todos os documentos e namespaces, bytes de Storage e lotes de até dez documentos. Não contém os textos manuais anteriores.

```sh
pnpm exec tsx scripts/manual-source-cleanup.ts plan \
  --snapshot /PASTA_PRIVADA/original.zip \
  --commit SHA_DO_COMMIT \
  --before-projection /PASTA_PRIVADA/before.json \
  --after-projection /PASTA_PRIVADA/after.json \
  --out /PASTA_PRIVADA/plan.json
```

5. Restaurar o ZIP integral em um backend **local anônimo descartável** que execute o mesmo código/schema. Conferir a identidade e a preservação de IDs, componentes e Storage. Manter no ensaio a manutenção do mesmo commit. O CLI admite somente esse tipo de ensaio; um deployment de desenvolvimento compartilhado não é aceito como descartável por seu nome.
6. Aplicar o plano e verificar por uma nova exportação ao vivo. `DIGEST_DO_PLANO` é o valor mostrado por `plan`; `/PROJETO_LOCAL_PRIVADO` contém a configuração `.convex/local/default/config.json` do backend descartável, sem expor sua chave administrativa.

```sh
pnpm exec tsx scripts/manual-source-cleanup.ts apply \
  --plan /PASTA_PRIVADA/plan.json --confirm DIGEST_DO_PLANO \
  --local-project /PROJETO_LOCAL_PRIVADO \
  --journal /PASTA_PRIVADA/rehearsal-journal.json
pnpm exec tsx scripts/manual-source-cleanup.ts verify \
  --plan /PASTA_PRIVADA/plan.json --confirm DIGEST_DO_PLANO \
  --local-project /PROJETO_LOCAL_PRIVADO \
  --snapshot /PASTA_PRIVADA/rehearsal-after.zip \
  --out /PASTA_PRIVADA/rehearsal-receipt.json
```

`apply` exporta e confere a origem antes do primeiro lote. Cada mutation verifica manutenção, commit, ausência de smoke e leases, schema instalado e os fingerprints anteriores/posteriores. Só o helper dos seis caminhos produz a alteração. Falha posterior de um item reverte todo o lote; uma resposta perdida pode ser repetida pelo journal, pois um documento já no estado esperado é reconhecido sem nova remoção/auditoria. A função não aceita substituição arbitrária de documentos. `verify` exige zero campos manuais restantes e igualdade dos demais dados, IDs, versões, registries e arquivos; permite os registros de auditoria previstos para os lotes daquele plano. Auth, referências institucionais, outros componentes e todos os bytes de Storage permanecem estritos.

A manutenção preserva heartbeat/disconnect de sessões existentes. Por isso, o plano inclui manifesto delimitado das seis tabelas de lifecycle de `presence` e seu `batchWorker`, vinculado às versões e hashes do código instalado. A reconciliação verifica separadamente identidades, campos estáveis e transições de deadline, conexão e agendamento; rejeita alterações de dados de presença, tokens retidos, configuração, referências de funções, criação/remoção de worker e quaisquer tabelas desconhecidas. Não existe opção genérica para ignorar drift. Registries `_tables` são comparados integralmente, inclusive os dos componentes.

Cada export conserva seu SHA-256 real. O relatório privado `<journal>.presence.json` registra a observação anterior; `<recibo>.presence.json` registra a posterior, vinculada por hash ao recibo. Esses relatórios registram hashes e contagens anteriores/posteriores, inserções, remoções e alterações, sem valores de tokens. Não afirmam que os bytes efêmeros ficaram iguais nem demonstram causalidade de cada heartbeat: demonstram compatibilidade limitada com o runtime instalado e preservação dos campos estáveis. O handler de limpeza escreve somente `calendarContents`/`calendarSnapshots` e auditoria; não recebe tabelas de componentes. Conservar ZIPs, manifesto, journals, relatórios e recibos juntos. Qualquer drift fora desse contrato bloqueia a reabertura e requer investigação explícita.

### Aplicação em produção e recuperação

Somente após o ensaio verificado, executar sobre o destino de produção versionado. Tanto o CLI quanto a mutation exigem um recibo de ensaio de outro deployment local, com o mesmo plano, backup, schema, commit e prova de equivalência. A origem ainda deve corresponder ao backup; divergência exige reconciliação e um novo ensaio, sem forçar o plano antigo.

```sh
pnpm exec tsx scripts/manual-source-cleanup.ts apply \
  --plan /PASTA_PRIVADA/plan.json --confirm DIGEST_DO_PLANO \
  --deployment exuberant-cheetah-138 \
  --rehearsal /PASTA_PRIVADA/rehearsal-receipt.json \
  --journal /PASTA_PRIVADA/production-journal.json
pnpm exec tsx scripts/manual-source-cleanup.ts verify \
  --plan /PASTA_PRIVADA/plan.json --confirm DIGEST_DO_PLANO \
  --deployment exuberant-cheetah-138 \
  --rehearsal /PASTA_PRIVADA/rehearsal-receipt.json \
  --snapshot /PASTA_PRIVADA/production-after.zip \
  --out /PASTA_PRIVADA/production-receipt.json
```

Conferir o recibo, as projeções e os resultados antes de encerrar a manutenção do SHA responsável e liberar a reserva exata. O CLI não publica código, não inicia/encerra manutenção e não restaura dados automaticamente. Em falha, manter a janela e o journal; repetir somente o mesmo plano, destino e recibo. As gravações e sua auditoria são transacionais, e o journal só avança após confirmação. A recuperação das fontes exige o backup anterior e análise dos dados posteriores à reabertura. Preservar todos os artefatos privados.

A reescrita histórica é uma exceção explícita à preservação dos snapshots, autorizada para esta retirada. A conclusão em produção exige a conferência do procedimento e dos recibos acima; os testes locais de handlers não substituem o ensaio com o backup real.
