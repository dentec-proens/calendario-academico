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

## Remoção das referências das etapas de avaliação

O campo comum `events[].evidence` continua disponível aos demais registros. Para etapas ativas e etapas explicitamente desvinculadas (`recordType: retired-stage`), a normalização não exige nem persiste referência. Copiar, importar ou restaurar um calendário passa pela mesma normalização. A revisão aceita as datas completas das etapas sem fonte, mantendo as regras de intervalo, sequência e oferta.

A função interna `maintenance/stageReferences:removePage` prepara a limpeza dos dados anteriores em `calendarContents` e `calendarSnapshots`, incluindo snapshots sem vínculo e calendários na lixeira. Ela não remove calendários, datas, versões, referências institucionais ou fontes de outros eventos. Identificadores legados de etapa também são reconhecidos. Notas antigas sem vínculo nem identificação de etapa não podem ser classificadas apenas pelo texto da fonte; não são apagadas por inferência. Pareceres, textos livres e PDFs já baixados não são reescritos.

Procedimento administrativo, separado de uma fast release:

1. Preparar e conferir backup integral com Storage em diretório privado e seu SHA-256. Ensaiar a restauração e a limpeza em deployment descartável, preservando IDs e comparando os demais campos e contagens. Os testes locais de handlers cobrem as barreiras e a transformação, mas não substituem esse ensaio com os dados do destino.
2. Publicar o código compatível (o schema aceita referência ausente, e a normalização impede sua reintrodução nas etapas). Confirmar o destino e a autorização da operação histórica; reservar a operação e entrar em manutenção com o SHA do código conferido. Aguardar ausência de leases; não conceder acesso de smoke durante a limpeza.
3. Para cada tabela, iniciar com `cursor: null` e `dryRun: true`; conservar somente contagens e os cursores retornados, sem registrar os valores antigos. Percorrer até `done: true`. O limite de leitura por chamada pode produzir páginas vazias intermediárias: continuar pelo cursor, não pela quantidade de resultados.
4. Aplicar as mesmas páginas com `dryRun: false`, `commit` igual ao proprietário da manutenção e `backupSha256` do backup conferido. A função processa até dez documentos por página, preserva metadados de versões e registra as contagens e o backup na auditoria. Repetições são idempotentes. Conservar os recibos por página em arquivo privado; falha conserva a manutenção e exige reconciliação antes de continuar.
5. Repetir a varredura completa em modo de prévia e comprovar zero campos restantes de etapas. Comparar estado atual, snapshots, versões e os demais dados com o backup, permitindo apenas a remoção prevista e os registros de auditoria. Encerrar a manutenção e liberar a reserva somente após essa conferência.

A reescrita histórica é uma exceção explícita à preservação dos snapshots, autorizada para esta retirada. A recuperação dessas fontes exige o backup anterior. Um deploy isolado ou uma fast release não executa essa limpeza; a execução em produção continua pendente até o procedimento acima ser realizado.
