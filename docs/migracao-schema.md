# Operações administrativas de dados

Este guia vale para as operações de **nível 2** descritas em [Implantação e operação](implantacao-convex-vercel.md#níveis-de-risco): exclusões, reescritas entre tabelas, mudanças de significado de um dado e alterações em auth, sessões ou Storage. Mudanças aditivas e conversões de nível 1 seguem só a release comum.

## Requisitos

- Destino explicitamente identificado e backup integral com Storage.
- Diretório privado fora do Git para ZIPs, planos, recibos e logs.
- Ensaio num deployment descartável restaurado do backup antes de qualquer aplicação em ambiente compartilhado.
- Conferência das exportações antes e depois: IDs, referências, versões, pareceres, componentes e arquivos.

Exportações podem conter credenciais e dados pessoais. Não publicar seus conteúdos em logs, issues ou Git.

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

Uma divergência não coberta por uma prova explícita exige investigação, sem alterar os hashes de um plano já ensaiado.

## Verificação e recuperação

Uma falha de fingerprint, arquivo, schema ou referência bloqueia a reabertura. Não remover registros nem relaxar validações para aprovar o plano. Preservar o ZIP sem edição manual.

A recuperação integral usa dados e código correspondentes. Dados produzidos após a reabertura exigem conciliação antes de restaurar um backup.

Recibos, contagens e backups de uma operação concluída ficam na pasta privada da operação e na mensagem do commit que a publica, não nesta documentação. Não reaplicar planos ou executores de uma operação já concluída.

## Formatos antigos que permanecem nos dados

O schema, os contratos e o código aceitam somente o formato 7 de calendário (`schemaVersion: 7`), inclusive nos envios. As férias são datas vinculadas às atividades de férias, sem campo próprio. Uma data local tem o efeito na contagem em `effect`, os dados de edital em `notice` e as ofertas listadas em `offers`; o vínculo com a atividade fica em `activity` (`ActivityRef`), com uma forma por base de repetição: atividade única, ciclo da oferta (`term`), semestre de referência (`semester`) ou etapa (`offerId` e `position`, com ciclo e número). Toda oferta tem organização, e as etapas por ciclo ficam em `stages`. A marcação `internal` indica data interna (art. 18). `saveCalendar` recusa estado fora do formato 7 e `saveReview` exige o marcador `schemaVersion: 7`.

A migração do formato 5 para o 6 teve perda declarada: a organização das ofertas a classificar foi inferida pelos períodos do calendário, períodos sem oferta que os recebesse foram removidos, inclusões letivas fora dos períodos viraram registro sem efeito, e datas com abrangência não confirmada passaram a contar para todas as ofertas listadas. Para ela, a evidência não preserva o significado: o backup prévio é o registro do que havia.

Alguns valores antigos continuam válidos no formato atual:

- Uma posição de etapa sem etapa correspondente na organização da oferta, inclusive as atribuídas pela migração, é um vínculo não gerado: fica em **Vínculo a conferir**, sem contar como atendimento, e volta a contar se a organização passar a gerá-la. Posições nunca são reinterpretadas.
- Os calendários que eram de teste antes do ciclo de vida guardam a marca em `label: 'Teste'`.
- O formato 7 converteu em férias escolares só as datas do campus aprovadas uma a uma; outras datas do campus com a categoria `ferias` continuam válidas e impedem o envio até serem corrigidas.
- Pareceres anteriores aos envios não têm `submissionId` e precisam ser salvos de novo no primeiro envio.
- Os envios seguem as migrações futuras de formato de `calendarContents`: salvo revogação declarada, a evidência preserva o significado, não os bytes.
- Em 2027 valem só as atividades declaradas pela política; ela não gera as linhas opcionais da lista operacional. Uma data vinculada a uma delas conserva o vínculo e fica em **Vínculo a conferir**. Anos sem política seguem a lista operacional.
- As entradas do snapshot institucional listam as ofertas que alcançam em `offers`, resolvidas a partir de `modalities` do catálogo quando são copiadas; o snapshot não tem `modalities`.
