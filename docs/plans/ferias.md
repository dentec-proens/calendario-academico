# Férias escolares e docentes em um só modelo

Estado: código, testes e ferramentas implementados em 06/11/2026; migração em produção pendente. Este plano é apagado com a contração.

## Objetivo

- Registrar férias escolares (critério III) e docentes (critério IV) com o mesmo modelo e a mesma
  interação, mantendo visíveis as diferenças que existem de fato.
- Resolver a pendência “Férias com representação única” (`docs/pendencias.md`).
- **Sem código nem dados legados.** Todos os calendários migram para o formato 7, o único suportado.

Devolver envios é aceitável: há 2 calendários enviados. Prazos de envio e atas são questões administrativas,
fora do sistema e deste plano.

## Situação atual

- Docentes: `teacherVacations` guarda até 3 intervalos, e `events` guarda datas derivadas com IDs
  `teacher-vacation-*`. Vários pontos interpretam esse prefixo. Remover uma data apaga o grupo inteiro.
- Escolares: nenhuma atividade, pendência nem link de correção. Só existe a data avulsa, encontrada na
  revisão por uma busca textual. Com efeito `note`, o dia continua contando.
- Nenhuma atividade da norma de 2027 cobre os critérios III e IV. Faltar qualquer uma das férias não gera
  pendência para o campus.

## O que converge e o que diverge

| Aspecto                                 | Escolares                                                 | Docentes                                                      |
| --------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| Registrar períodos                      | Sim                                                       | Sim                                                           |
| Início, dias corridos e término         | Igual                                                     | Igual                                                         |
| Efeito `exclude` e categoria `ferias`   | Igual                                                     | Igual                                                         |
| Número de períodos                      | Sem limite                                                | Sem limite                                                    |
| Dentro do ano do calendário             | Igual                                                     | Igual                                                         |
| Sem sobreposição no mesmo tipo e oferta | Igual                                                     | Igual                                                         |
| Ofertas                                 | Escolhidas por período                                    | Sempre todas, inclusive pós-graduação e as adicionadas depois |
| Quantidade                              | Basta haver férias em cada oferta, sem número de períodos | Exatamente 45 dias no ano, com bloqueio                       |
| Nome                                    | Editável, por exemplo “Recesso escolar”                   | Gerado                                                        |
| Coincidência entre as duas              | Referência                                                | Orientação; parcial é válida                                  |

## Decisão de modelo

`events` passa a ser a **fonte única**. As férias são datas vinculadas a duas atividades, e um módulo de
domínio guarda o que as atividades comuns não garantem.

Motivos:

- Contagem, sábados, impressão e prontidão já leem `events`. Nenhum desses leitores precisa de outra fonte.
- A avaliação por atividade × oferta já oferece pendência, cobertura e evidência para III e IV.
- A migração reescreve poucos campos e não altera o que a contagem lê.

Alternativas descartadas:

- **Períodos estruturados com datas derivadas na projeção.** Tem o modelo mais limpo, mas há cerca de 135
  usos de `.events` em 43 arquivos. Um leitor esquecido contaria dias de férias sem nenhum erro, e tirar as
  datas ao gravar recriaria o filtro de hoje.
- **Registro “ambos” para as duas férias.** Coincidência é um resultado a calcular. Um registro único
  obrigaria a dividi-lo no primeiro ajuste de um dia, misturaria escopos de oferta e faria a evidência de um
  critério depender do outro.

Limite conhecido: a unificação elimina a reconciliação entre as duas representações, mas não toda a
complexidade. O formulário, a cópia em grupo e a sincronização de ofertas continuam existindo.

## Proposta

### 1. Formato 7

- `CalendarContent` perde `teacherVacations`, e `calendarSchemaVersion` passa a 7.
- Atividades `school-vacation` (critério III) e `teacher-vacation` (critério IV), de repetição única, com
  categoria `ferias` e nova variante `vacation`.
- A variante tira as duas da lista de **Atividades**, como `stage` já faz (`activity-step.ts`), e leva
  pendências e correções a `/ferias` (`issueSection`, `criterionDestination`). O caso fixo do critério IV em
  `criterionDestination` sai.
- As duas entram no catálogo da norma e, como opcionais, no catálogo operacional. Sem isso, datas docentes de
  anos sem norma virariam `not-generated` e bloqueariam a conclusão (`links.ts`, `plan-evaluation.ts`).

**Removidos:** `commands/vacations.ts`, `regeneratedVacations`, o validador `vacations`, o parser em
`input.ts`, o ramo em `civil-dates.ts`, a reconciliação em `normalize.ts`, `derivedVacation` e
`diff.vacations`, o caso especial em `removeEvent` e `restoreEvents`, e a regex de `validation.ts`.
Nenhum código interpreta o ID de uma data de férias.

### 2. Módulo `activities/vacations.ts`

Invariantes verificadas ao gravar (comandos e normalização) e na prontidão para datas salvas:

- Efeito `exclude` e categoria `ferias`, em todo ano, sem depender da política.
- Início e término dentro do ano do calendário. A validação atual já recusa o que passa disso.
- Sem sobreposição no mesmo tipo em ofertas comuns.
- Docentes: em `normalize.ts`, antes de `listedOffers`, as ofertas são sempre todas as do calendário, inclusive
  pós-graduação. É a mesma exceção de hoje, agora declarada num só lugar.
- Nome das docentes gerado: `Férias docentes — 20 dias`. Nas escolares, o nome começa como `Férias escolares` e pode
  ser editado.
- Campus não cria mais data avulsa com categoria `ferias`. O formulário retira a opção e o servidor recusa. Há
  um só caminho para registrar férias.

### 3. Virada do ano

**Cada calendário registra só a parte das férias que está no seu ano.** Férias reais de 23/12/2027 a 20/01/2028 viram
23/12 a 31/12 no calendário de 2027 e 01/01 a 20/01 no de 2028. Não há exceção na validação, nem recorte de intervalos.

A contagem fica exata. Um exemplo de 45 dias docentes em 2027:

| Período no calendário de 2027 | Dias   |
| ----------------------------- | ------ |
| 01/01 a 20/01                 | 20     |
| 05/07 a 20/07                 | 16     |
| 23/12 a 31/12                 | 9      |
| **Total**                     | **45** |

A impressão segue o costume dos calendários feitos à mão, sem mostrar 31/12 como se fosse o fim das férias:

| Onde                             | O que aparece                                     |
| -------------------------------- | ------------------------------------------------- |
| Grade de dezembro                | Dias 23 a 31 marcados na cor de férias, como hoje |
| Lista de dezembro                | `23` · `Início das férias escolares`              |
| Lista de janeiro do ano seguinte | `1 a 20` · `Férias escolares`                     |

- Vale para férias que começam em dezembro e terminam em 31/12. O dado guardado não muda: é só a forma de escrever a
  linha. Um período mais longo, iniciado antes de dezembro, segue a listagem mensal atual.
- Nas docentes, a linha mantém os dias: `Início das férias docentes — 9 dias`. Com nome editado, fica
  `Início: Recesso escolar`.
- O editor mostra `23/12 a 31/12 · 9 dias · até o fim do ano`. A ajuda diz: “Se as férias continuam no ano seguinte,
  termine em 31/12 e registre o restante no calendário daquele ano.”
- Cada calendário confere só os próprios 45 dias. O sistema não compara um ano com o outro.

### 4. Passo “Férias”

O passo “Férias docentes” passa a se chamar “Férias” e usa o endereço atual, `/ferias`. Não há passo novo.

```
Férias
Os dias destes períodos não contam como letivos.

FÉRIAS ESCOLARES · Art. 11, III
Inclui o recesso escolar de julho.
 Férias escolares
 01/01 a 20/01 · 20 dias                        [Editar] [Remover]
 Vale para: Integrado, Graduação
 Retira: Integrado 0 · Graduação 0 dias letivos
 [+ Adicionar período]

FÉRIAS DOCENTES · Art. 11, IV · todo o campus
 [Usar os períodos das escolares] [+ Adicionar período]
 Total em 2027: 40 de 45 dias. Faltam 5.
 31 dias coincidem com as férias escolares.
```

- Um mesmo componente de lista e edição serve aos dois tipos: início, dias corridos e término, sem limite de
  linhas. Corrige dois incômodos de hoje: os dias corridos vazios ao reabrir e a remoção do grupo inteiro.
- **Vale para** reaproveita `SaturdayOfferChoice` nas escolares e não aparece com uma só oferta.
- **Dias retirados por oferta** ficam visíveis antes de aplicar. As férias de julho do integrado anual, marcadas
  em todas as ofertas, retiram dias de um semestre da graduação, e hoje só a faixa de contagem mostra isso.
- **Usar os períodos das escolares** faz uma cópia única e independente. Se as escolares variarem por oferta, a
  pessoa escolhe a oferta de origem. O total de 45 continua sendo conferido.
- **Coincidência** é uma informação neutra, sem aviso nem cor de alerta, porque é orientação e a parcial é válida.
  Com escolares diferentes por oferta, o texto mostra a faixa, por exemplo “Coincidem 31 dias no Integrado e 20 na
  Graduação”.
- Em somente leitura, as mesmas linhas e resumos aparecem sem botões. Numa correção vinda da revisão, a seção
  certa abre com a observação do parecer.
- O total só aparece nas docentes, para não sugerir meta às escolares.

### 5. Restante do fluxo

- **Por data, em Atividades:** lista as férias e abre `/ferias`, olhando a atividade, não o ID
  (`EventEditorProvider.tsx`).
- **Conferir e enviar:** pendência se faltar algum tipo, se uma oferta ficar sem escolares ou se o total docente no
  ano for diferente de 45. Pendências docentes são agrupadas em uma linha, em vez de uma por oferta. A coincidência
  não gera aviso.
- **Exigência dos 45 dias:** um campo na regra de `teacher-vacation` na norma de 2027, avaliado em
  `plan-evaluation.ts` como `minHours`, mas exato. Total diferente de 45 bloqueia o envio e a publicação. Sem isso, a
  cobertura ficaria completa com um único dia.
- **Presença das escolares:** basta haver um período alcançando cada oferta, sem número mínimo. Um único período
  pode valer para todas.
- **Parecer:** III e IV ganham evidência de cobertura e link de correção. O IV mostra o total calculado e a
  coincidência como informação. A nota atual, de que a identificação do evento não comprova a quantidade, sai.
- **Critério III:** `pattern` permanece para mostrar candidatas à parte. `isTeacherVacation` deixa de olhar o ID
  e de descartar nomes com “escolar”.
- **Comparação de versões:** uma seção “Férias” por tipo, por período e não por posição, com antes e depois do
  total. Sincronizar docentes com uma oferta nova não aparece como mudança de cada data.
- **Cópia entre calendários:** um item por tipo. O docente substitui o grupo, como hoje. O escolar escolhe ofertas
  no destino. As comparações de `copy-dates.ts` passam a considerar o vínculo, com testes de não regressão,
  porque isso alcança todas as atividades.
- **Impressão:** categoria, legenda e cor não mudam. Quando um período docente e um escolar têm as mesmas datas, o
  nome padrão e todas as ofertas, a lista do mês mostra uma só linha: `Férias escolares e docentes — 16 dias`. Com nome editado
  ou ofertas parciais, continuam duas linhas, para não afirmar algo que os dados não dizem. O registro continua
  sendo dois: a fusão é só da impressão. A linha de início em dezembro segue a seção 3, inclusive na fusão:
  `Início das férias escolares e docentes`.

### 6. Migração (nível 2)

**Conversão.** Em `calendarContents.state` e `calendarSubmissions.state`, de todos os status, inclusive publicados
e na lixeira:

- Retira `teacherVacations` e vincula as datas `teacher-vacation-*` à atividade `teacher-vacation`.
- Para com erro, sem corrigir, se os intervalos e as datas divergirem. Um teste de inversa prova que o campo é
  reconstruível.
- Recalcula `contentHash` na mesma escrita, conferindo antes o valor antigo. Não altera `version`,
  `contentVersion` nem `updatedAt`.
- `reviews`, `reviewVersions`, `decisions` e `audit` não guardam o formato e não mudam. Envios preservam o
  significado, não os bytes, como manda `docs/migracao-schema.md`; o backup guarda os bytes originais.

**Datas avulsas de férias ou recesso escolar.** O projeto não infere vínculo pelo nome, então a conversão não é
automática:

1. O inventário, feito na exportação, lista cada data com categoria `ferias` e cada recesso com “escolar” no nome,
   com calendário, nome, datas e efeito.
2. A gestão aprova a lista do que vira `school-vacation`. Casos ambíguos ficam de fora e são tratados com o campus.
3. A conversão recebe essa lista explícita e preserva o nome, como “Recesso escolar”. A categoria passa a `ferias`, o
   que muda a cor na impressão.

Uma data com `note` que passa a `exclude` **muda a contagem**, e o total pode cair abaixo de 200. Por isso cada
caso é declarado e comunicado ao campus.

**Ordem**, seguindo as migrações dos formatos 5 e 6:

1. Conversor puro, com testes, e schema aceitando os dois formatos só durante a janela. O domínio lê apenas o 7.
2. Backup, restauração descartável, ensaio e pausa.
3. Execução em manutenção, com lote de um documento.
4. Verificação sobre a exportação, em conteúdos e envios: totais, `ledger` e conflitos iguais, salvo os casos
   declarados; linhas de impressão iguais, salvo a redação de dezembro e a fusão das seções 3 e 5, que alcançam também calendários publicados e entram na comunicação; hashes coerentes onde já eram.
5. Reabertura, seguida da contração, que retira o conversor e a união do schema.
6. A regra nova (seção 7) vai na mesma release: o que ela altera nos calendários enviados não depende da conversão, e duas versões exigiriam dois catálogos temporários.

**Recuperação.** Antes da reabertura, restaurar o backup com o código correspondente. Depois dela, conciliar antes
de restaurar.

**O ensaio de release precisa de ajuste.** `release-rehearsal.ts` lê a exportação no formato 6, `input.ts` recusaria
todo calendário editável, e o deploy para. Além disso, o ensaio não cobre publicados nem contagem, hash e parecer. É
preciso conversão temporária no ensaio, e o verificador do passo 4 cobre o restante.

Calendários publicados não recebem nova regra, mas têm o conteúdo convertido, porque o formato 7 é o único.

### 7. Regras e devolução

A adição das atividades como exigência é uma versão `tightens` com `criteria: ['III', 'IV']`.

- Os 2 calendários enviados ficam incompatíveis e voltam ao campus. **Antes de devolver, o parecer precisa estar
  salvo**, ou a lista de critérios não atendidos se perde.
- Todos os critérios voltam a `PENDENTE` no novo parecer. `criteria` é informativo.
- Calendários publicados não mudam de situação.
- A redação do critério IV registra que os 45 dias são exatos e contados no ano do calendário, com a fonte
  “decisão da gestão”. O mesmo vale para o critério III, quanto ao recesso escolar de julho.

### 8. Comunicação

A redação impressa muda também em publicados: `Início das férias` em dezembro e a linha única de datas iguais, sem mudar datas nem contagem. Aos campi: o passo mudou de nome e pede os dois tipos, as docentes foram mantidas, os 45 dias agora são conferidos, e
cada calendário com data convertida recebe a lista do que mudou e o efeito nos dias letivos. Aos pareceristas: III e
IV ganham evidência, a coincidência é informativa, e calendários devolvidos exigem novo parecer. Em abas abertas,
alterações não salvas se perdem, então a operação deve ocorrer fora do horário de revisão.

## Decisões

Registradas em 06/11/2026:

1. A falta de qualquer uma das férias é pendência bloqueante.
2. Não há limite de períodos.
3. Datas avulsas são convertidas por lista explícita aprovada pela gestão, e a categoria `ferias` deixa de estar
   disponível nas datas do campus.
4. Os 45 dias docentes são valor exato, contado dentro do ano do calendário, e um total diferente bloqueia o envio.
5. Períodos de férias ficam dentro do ano do calendário, sem cruzar a virada.
6. Férias docentes são únicas para todo o campus e não variam por oferta. O sistema garante isso dentro de cada
   calendário, sem consulta entre calendários.
7. Férias escolares exigem só a presença, sem número específico de períodos.
8. A coincidência é orientação, e a parcial é válida.
9. Recesso escolar de julho atende ao Art. 11, III.
10. Datas iguais podem sair em uma só linha impressa, se isso melhorar a leitura.

## Ordem de implementação

1. **Domínio e formato 7:** módulo de férias, atividades, conversor e remoção de `teacherVacations`, com testes e
   fixtures.
2. **Interface:** passo “Férias”, destinos, comparação, cópia, impressão e evidência dos critérios III e IV.
3. **Operação:** ajuste do ensaio, verificador, inventário das datas avulsas e lista aprovada.
4. **Produção:** migração, contração, versão `tightens` e devolução dos 2 envios, cada etapa com autorização própria.

## Riscos

1. **Mudança na contagem** nos casos declarados de data avulsa, pelo total abaixo de 200.
2. **Calendários atuais com total diferente de 45**, que passam a ter pendência e não podem ser enviados até a correção.
   O inventário deve mostrá-los.
3. **Dados inesperados**, sem consulta até aqui: intervalos e datas divergentes, datas `teacher-vacation-*` órfãs ou
   datas docentes com outro vínculo. O conversor para e a decisão é caso a caso.
4. **Recesso escolar registrado fora do passo.** Um campus pode manter um recesso avulso e ainda precisar preencher as
   férias escolares. O texto da seção e a pendência precisam deixar isso claro.
5. **Término em 31/12 sem continuação real.** A impressão escreve “Início das férias” mesmo se as férias acabarem nesse
   dia. O dado continua correto e a grade mostra os dias, então o efeito é só de redação.

## Fora do escopo

- Docentes por oferta.
- Bloqueio ou aviso por falta de coincidência.
- Coerência de um mesmo período entre os calendários de anos diferentes.
- Consulta ou aviso sobre férias docentes de outro calendário do campus.
- Nova categoria ou cor, ou férias individuais de cada docente.
- Faixa visual de meses ou seleção em grade, como em Sábados.
- Prontidão de anos sem norma ignorando `excludeFromSearch`: registrar em `docs/pendencias.md`, porque a correção
  bloquearia publicações sem versão de regras.

## Testes

- **Conversor:** inversa, parada em divergência, hash recalculado, lista explícita de avulsas e contagem igual fora
  dela. Fixtures armazenadas passam ao formato 7 (`stored/contents.json`, `stored/oracle.json`,
  `format-6-storage.test.ts`).
- **Invariantes:** efeito e categoria em todo ano; docentes em todas as ofertas, inclusive pós-graduação e uma
  adicionada depois; sobreposição recusada no mesmo tipo e aceita entre ofertas distintas; data avulsa com `ferias`
  recusada.
- **Virada do ano:** período fora do ano é recusado; 23/12 a 31/12 soma 9 dias, com a grade marcada de 23 a 31 e a linha
  `Início das férias escolares` só no dia 23; 01/01 a 20/01 mantém a linha normal; período iniciado antes de dezembro
  mantém a listagem mensal; a forma escrita vale para nome padrão, nome editado e linha fundida.
- **Contagem:** julho em oferta anual; escopo por oferta; sábado letivo dentro das férias gera conflito e não conta.
- **45 dias:** 45 no ano completa; 44 e 46 geram pendência e impedem o envio.
- **Avaliação e prontidão:** uma oferta coberta e outra não; um único período cobrindo todas as ofertas fica completo;
  pendências docentes agrupadas; oferta de pós-graduação na
  data não vira `not-generated`; datas em anos sem norma também não.
- **Catálogo e versão:** `released2027`, `releasedGlobal`, `releasedOperational`, `declared-categories.ts`,
  `ruleset-history.test.ts` e oráculos regenerados, com o diff declarado no commit. `readyContent` em
  `test/helpers/lifecycle.ts` precisa gerar `exclude` e 45 dias.
- **Revisão:** cobertura e link em III e IV, total e coincidência como informação, “Férias escolares e docentes” segue
  candidata.
- **Comparação e cópia:** seções por tipo; vínculo preservado com avulsa homônima; demais atividades mantêm o
  comportamento.
- **Impressão:** uma linha com datas iguais, nome padrão e todas as ofertas; duas linhas com nome editado ou ofertas
  parciais.
- **Navegador:** preencher os dois tipos, adicionar e remover um período isolado, copiar das escolares, ver os dias
  retirados, em 390 px e somente leitura. Cerca de 26 arquivos de teste citam o campo ou os IDs.
