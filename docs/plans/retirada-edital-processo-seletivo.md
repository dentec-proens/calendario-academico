# Retirada do edital do Processo Seletivo 2028 do calendário do campus

Operação de dados de **nível 2** (exclusão de valores sem equivalente), decidida pela gestão do sistema em 17/11/2026. Este plano vale enquanto a operação não estiver concluída em produção; depois, as decisões que continuam valendo ficam na documentação permanente e o plano é apagado.

## Decisão

Os editais do Processo Seletivo 2028 são publicados pela Reitoria até 15/06/2027 (Art. 10 da Resolução 292). O prazo já consta da base institucional, pela tabela do Art. 2º, e aparece em todo calendário. O campus não publica esses editais e não tem data própria a registrar. Por isso o Art. 10 sai do calendário do campus por completo: não é atividade, não tem critério de parecer e não entra em "O que a revisão não avalia", que lista deveres do campus não conferidos (como o Art. 9º).

## Regra (`consup-292-2027-v13`, `relaxes`)

- A atividade `regular-admission-notice` continua declarada com `retired`, porque uma atividade publicada nunca sai do catálogo: os vínculos de envios e de calendários fora de edição continuam legíveis. Ela não exige nada de nenhuma oferta, e as listas e a evidência do parecer só a mostram enquanto alguma data aponta para ela.
- Sai o critério `admission-regular` e o aviso do Art. 10 no formulário.
- O salvamento e a nova versão de um calendário vigente removem as datas de atividades retiradas (`withRetiredActivitiesDropped`). Isso cobre abas abertas antes da migração e calendários que voltem a ser editáveis, sem janela de manutenção.

## Dados

Migração `dropRetiredActivityLinks` (`convex/migrations.ts`): nos calendários em edição, remove as datas vinculadas a atividades retiradas, sem nova versão e sem mudar o `rulesetVersion` gravado. Envios e calendários fora de edição não mudam: o envio fixou o conteúdo por hash, e o parecer julga o que foi enviado.

Inventário de produção em 17/11/2026, lido sem gravar: 26 datas vinculadas em 21 calendários (17 rascunhos e 4 enviados), 10 envios históricos com a data e nenhum parecer.

## Ensaio

Em 17/11/2026, sobre uma exportação integral da produção importada com `--replace-all` no deployment de desenvolvimento (descartável para o ensaio, com autorização do usuário):

- `dryRun` e execução: 60 documentos processados, estado `success`.
- 22 datas removidas de 17 rascunhos; as 4 datas dos 4 calendários enviados ficaram.
- Comparação das exportações antes e depois: só mudaram os 17 conteúdos, e em cada um só saíram as datas do edital regular; o resto do documento ficou idêntico. As demais tabelas, os envios e o Storage ficaram iguais; o componente de migrações ganhou o registro da execução.
- Pendências calculadas como no editor (`groupPendencies(contentIssues(...))`): nenhum calendário ganha pendência; 17 perdem, 22 no total (as pendências das próprias datas removidas). O código anterior já não pedia a atividade aos calendários sem data, porque a data da base valia como referência.

## Produção

1. Commit em `main` com a regra, a migração em `pending` e os testes.
2. `pnpm deploy:production`: exporta o backup com Storage, publica o Convex e conclui a migração pendente.
3. Conferir `migrations:status` (`success`) e, numa exportação posterior, que nenhum conteúdo em edição tem data vinculada a `regular-admission-notice`.
4. Release seguinte: tirar a migração de `pending`, mantendo o teste do salvamento, e apagar este plano.

## Depois da operação

Sem o edital regular, nenhuma regra usa o prazo de referência (`deadlinePolicy: 'reference'`): a prorrogação por feriado municipal (Art. 3º, § 2º), o prazo ajustado declarado pelo campus (`deadlineAdjustment`) e o estado "ajustado" deixam de ter uso. Em produção, só as duas datas removidas tinham `deadlineAdjustment`. A retirada desse código e a contração do schema são uma mudança própria, depois de concluída a migração.
