# Migração canônica dos calendários

A conversão unifica o estado atual e os snapshots históricos no formato 2. O runtime deixa de interpretar representações antigas. A ferramenta administrativa e o código anterior arquivado permitem recuperar os backups anteriores sem manter adaptadores na aplicação.

## Garantias

Somente `calendarContents`, `calendarSnapshots` e `institutionalEvents` recebem substituições. Permanecem os IDs, `_creationTime`, versões, datas, referências, evidências, nomes e datas dos eventos. As demais tabelas são comparadas integralmente, incluindo `calendarVersions`, auditoria, Auth, arquivos, `reviews` e `reviewVersions`. Os textos dos pareceres permanecem exatos.

A conversão explicita modalidades e decisões ausentes, transforma a contagem comum de etapas em mapa por modalidade quando conhecida, usa `{}` quando desconhecida, e vincula etapas antigas à modalidade somente quando o escopo é inequívoco. Eventos com os IDs estáveis de férias passam de `note` para `exclude`, preservando o efeito já usado na contagem. A categoria do evento institucional de criação do IFPR é explicitada como `criacao`. O campo institucional `offers` passa a ser `modalities`.

Modalidades ambíguas, férias sem intervalos explícitos, pares de eventos de início/fim e vínculos sem chave de candidato interrompem o planejamento em vez de inventar informações ou trocar identidades. Nenhuma data é recalculada. O conversor é idempotente e não edita a fonte.

Os pareceres merecem uma distinção: a aplicação antiga alterava sua apresentação, substituindo `XXX/2026` e removendo números de versão da introdução. O formato novo exibe o texto efetivamente salvo. Essa mudança deliberada de apresentação não é mascarada pela comparação de impressão dos calendários; não se altera o texto para imitar a apresentação anterior.

## Planejamento e ensaio

Use diretórios privados `backup-*/`, ignorados pelo Git, com permissões restritas. Preserve um arquivo do código anterior e o SHA de origem para comparar o runtime antigo com o novo. Faça exportação completa por deployment explícito com `--include-file-storage`; não compartilhe backups ou dados pessoais.

```sh
node --import tsx scripts/migrate-data.ts plan --canonical --snapshot backup-canonical/frozen.zip --out backup-canonical/plan.json
node --import tsx scripts/migrate-data.ts prepare --plan backup-canonical/plan.json --out backup-canonical/maintenance
```

O plano inclui fingerprints da fonte, substituições em lotes e fingerprints do resultado esperado. Um plano sem lotes deve ser tratado como conferência sem migração, antes de entrar em manutenção. A operação `apply` recusa planos vazios.

Restaure o backup completo em um Convex local anônimo e descartável, com os mesmos componentes montados. Nesse destino vazio, a importação integral pode usar `--replace-all --yes`; essa opção não pertence à aplicação nos bancos originais. Aplique o plano, exporte novamente e confira:

```sh
node --import tsx scripts/canonical-check.ts backup-canonical/frozen.zip backup-canonical/after.zip backup-canonical/equivalence.json
node --import tsx scripts/canonical-runtime-check.ts backup-canonical/frozen.zip backup-canonical/after.zip backup-canonical/baseline backup-canonical/runtime-equivalence.json
```

A primeira verificação confere o resultado canônico exato, as invariantes independentes, o schema final, o Storage e todos os namespaces de componentes. A segunda importa o código anterior de uma cópia separada e compara contagem completa, HTML de impressão, apoio ao parecer, prontidão para liberação e a visibilidade e identidade das sugestões históricas. Todos os candidatos de todas as análises salvas são conferidos contra o editor atual. Estados cuja contagem está incompleta devem permanecer incompletos com o mesmo erro; falhas de impressão ou de apoio ao parecer bloqueiam a verificação.

Publique o backend final na cópia convertida e confira as consultas reais de calendários, versões e pareceres, a recusa de acessos anônimos e o escopo das contas. Execute `pnpm check` e revisões independentes antes dos destinos originais.

## Aplicação nos bancos existentes

O projeto temporário conserva `convex/convex.config.ts`, incluindo Presence e seu componente filho. A manutenção remove os endpoints da aplicação, mas não desmonta os componentes nem troca credenciais. Guarde um backup completo anterior à manutenção.

Para impedir que expirações normais mudem a fotografia durante o ensaio, pare temporariamente o worker `disconnect` no componente `presence/batchWorker` com `lib:stop`, conferindo `lib:status`. A alteração operacional do worker fica separada da conversão. Exporte então o backup congelado completo, gere o plano sobre essa fotografia e ensaie exatamente esse plano em ambiente descartável.

Use as operações `apply`, `verify` e `finish` descritas na [ferramenta de migração](migracao-schema.md), com destino e digest explícitos. Produção exige o recibo verificado do mesmo plano e schema em outro deployment. A origem é conferida novamente antes de escrever; qualquer mudança exige novo plano e novo ensaio. Não relaxar fingerprints para acomodar concorrência.

Antes de remover o checkpoint, confira também a equivalência dos componentes com o backup congelado. O leitor antigo de snapshots da raiz não basta: há tabelas e Storage sob `_components/presence/` e sob seu filho `batchWorker`. Somente os catálogos `_tables`, administrados pelo Convex, são tratados como metadados reconstruíveis.

Publique backend e frontend correspondentes, exigindo atualização de clientes antigos pelo novo contrato. Retome o worker com `lib:start` depois da conferência. A limpeza de uploads temporários deve ocorrer somente depois de preservar o resultado verificado. Guarde backups, planos, logs e recibos em local privado.

Se uma verificação falhar, mantenha a manutenção e investigue. Um rollback deve restaurar o backup integral e o código anterior compatível; nunca apagar documentos para forçar uma validação. Não restaurar um backup antigo sobre dados novos criados após a reabertura.
