# Operações administrativas de dados

Este guia vale para as operações de **nível 2** descritas em [Implantação e operação](implantacao-convex-vercel.md#níveis-de-risco): exclusões, reescritas entre tabelas, mudanças de significado de um dado e alterações em auth, sessões ou Storage. Mudanças aditivas e conversões de nível 1 seguem só a release comum.

## Requisitos

- Destino explicitamente identificado e backup integral com Storage.
- Diretório privado fora do Git para ZIPs, planos, recibos e logs.
- Ensaio num deployment descartável restaurado do backup antes de qualquer aplicação em ambiente compartilhado.
- Conferência das exportações antes e depois: IDs, referências, versões, pareceres, componentes e arquivos.

Exportações podem conter credenciais e dados pessoais. Não publicar seus conteúdos em logs ou artefatos de CI.

## Ferramentas

`scripts/administration/` reúne o que é reutilizável entre operações, fora do runtime do navegador e das funções de negócio:

- `snapshot.ts` lê uma exportação Convex (ZIP), com tabelas, componentes e Storage.
- `canonical.ts` serializa e calcula fingerprints estáveis para comparar estados.
- `presence-lifecycle.ts` e `presence-runtime.ts` reconciliam o ciclo normal do componente de presença, que muda entre duas exportações sem relação com a operação.
- `cli-environment.ts` executa a CLI do Convex contra um destino isolado.

Uma conferência específica de uma operação (projeções, inventários, executores temporários) é escrita para ela e retirada do código ao final. O que foi usado permanece no histórico do Git.

## Dados efêmeros

A comparação de exportações precisa separar a mudança da operação do que muda sozinho:

- A autenticação continua renovando credenciais de sessões existentes durante a manutenção. Essas renovações são esperadas.
- O ciclo de presença é conferido somente nas tabelas e campos inventariados da versão instalada, preservando identidades e dados estáveis.
- Tickets e PDFs efêmeros podem expirar durante a manutenção. Concluir seu ciclo normal antes do backup evita confundi-lo com mudanças da operação. Os demais arquivos continuam sujeitos à comparação estrita.

Uma divergência não coberta por uma prova explícita exige investigação, sem alterar os hashes de um plano já ensaiado.

## Verificação e recuperação

Uma falha de fingerprint, arquivo, schema ou referência bloqueia a reabertura. Não remover registros nem relaxar validações para aprovar o plano. Preservar o ZIP sem edição manual.

A recuperação integral usa dados e código correspondentes. Dados produzidos após a reabertura exigem conciliação antes de restaurar um backup.

Recibos, contagens e backups de uma operação concluída ficam na pasta privada da operação e na mensagem do commit que a publica, não nesta documentação. Não reaplicar planos ou executores de uma operação já concluída.

## Formatos antigos que permanecem nos dados

O código exige o formato 5 de calendário, inclusive nos envios e no catálogo: o efeito de uma data na contagem passa de `kind` a `effect`, `recordType` deixa de existir, os dados de edital ficam em `notice` e as ofertas de uma data local ficam sempre listadas em `scope: { offers, confirmed }` (uma lista ausente ou vazia do formato 4 vira as ofertas do próprio estado, com `confirmed: false`; uma lista não vazia, inclusive a materializada por acréscimo de oferta, vira `confirmed: true`, assim como, no envio que a comprova, a cópia da mesma data sem ofertas). As etapas de uma oferta ficam em `stages`: `{ status: 'reported', count }` para a quantidade informada sem ciclo confirmado (o `legacyStageCount` do formato 4) e `{ status: 'defined', perTerm }` para as etapas por ciclo. Os dados já gravados estão no formato 4 até a migração do plano [Atividades e datas](plans/2026-11-02-atividades-e-datas.md) (seção 6), que ainda não foi publicada: o conversor puro `src/domain/calendar/migration/convert-v5.ts` e os validadores congelados do formato 4 (`convex/legacyValidators.ts`) existem só para ela. Até lá, não publique a `main` nem rode `pnpm dev` contra um deployment com documentos do formato 4. Alguns valores antigos continuam válidos no formato atual:

- `stages: { status: 'reported', count }` (no formato 4, `legacyStageCount`) representa a quantidade conhecida de etapas de uma oferta com organização pendente. Confirmar a organização da oferta a resolve em `{ status: 'defined', perTerm }`; as cópias de envio feitas antes disso conservam a quantidade informada.
- Os calendários que eram de teste antes do ciclo de vida guardam a marca em `label: 'Teste'`. A migração `calendarPurposeToStatus` converteu todos para rascunho sem alterar `version`; `calendars.purpose` e as tabelas de histórico por salvamento (`calendarVersions` e `calendarSnapshots`) saíram do schema.
- Pareceres anteriores aos envios não têm `submissionId` e precisam ser salvos de novo no primeiro envio.
- Os envios seguem as migrações futuras de formato de `calendarContents`: a evidência preserva o significado, não os bytes.
- Em 2027 valem só as atividades declaradas pela política; ela não gera mais as linhas opcionais da lista operacional (a antiga “Classificação legada”). Uma data vinculada a uma delas conserva o vínculo e fica em **Vínculo a conferir**. Anos sem política seguem a lista operacional.
- Os snapshots institucionais conservam tipos normativos em `modalities`. O escopo é resolvido por `offer.kind`, sem reintroduzir esse campo nos eventos locais.
