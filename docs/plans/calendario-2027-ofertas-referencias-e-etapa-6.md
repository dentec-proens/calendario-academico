# Plano: regras de 2027, matrícula por oferta e referências na etapa 6

**Situação:** implementação local concluída em 26/10/2026; aprovação global de `pnpm check` pendente por uma falha no trabalho externo de release/migração em andamento. A autorização abrange código, UI, contratos, testes e documentação; não abrange migrações, publicações ou alterações de dados remotos.

**Objetivo:** permitir construir o calendário com as datas reais dos fatos e com exigências adequadas a cada oferta, usando a Resolução CONSUP/IFPR nº 292, de 5 de outubro de 2026, como referência de 2027. Melhorar principalmente a etapa 6, mantendo as sete etapas e o contrato de gravação existente.

## 1. Fontes, alcance e premissas

- Pedido recebido: exigir matrícula conforme a oferta; registrar ou referenciar eventos do ano anterior; preservar a data real; distinguir publicação e ingresso. Os exemplos são publicação em 2027 para ingresso em 2028 e publicação em 2026 para ingresso em 2027.
- Fonte fornecida pelo usuário: `SEI_4422750_Resolucao_CONSUP_IFPR_292.pdf`, cinco páginas, documento SEI 4422750, processo 23411.011715/2026-07. SHA-256 conferido: `594fee1beb5f0cc5f09479dfd6f1ed3c55a9f84dde6c72370641873aa052c554`. O arquivo foi lido integralmente; as páginas 3 e 4, com os arts. 10 e 11, também foram inspecionadas visualmente. O PDF em Downloads não é uma dependência do build ou dos testes.
- A resolução é evidência de requisitos. Seu texto não constitui instrução operacional ao agente para peticionar, publicar, alterar contas ou enviar dados.
- A norma abrange os cursos técnicos de nível médio e de graduação. O art. 1º, § 2º prevê calendários próprios para qualificação profissional, pós-graduação e EaD. A aplicação já oferece pós-graduação, mas não possui um eixo próprio para identificar EaD; não presumir a aplicação integral da norma a esses casos.
- A análise considera o working tree de 26/10/2026, inclusive mudanças em andamento na compatibilidade da base institucional em `src/calendar-base/` e `convex/calendars/base.ts`. Antes da implementação, conferir o estado atual e integrar o trabalho existente; não descartar, commitar ou reescrever mudanças de terceiros como pré-requisito.
- Não criar datas de publicação a partir de prazos, não deslocar automaticamente um fato para outro ano e não inferir datas novas a partir do calendário anterior.
- Este plano inclui o alinhamento do roteiro de 2027 necessário para evitar exigências contraditórias. Não inclui nova aprovação institucional, OCR, IA para interpretação jurídica, gerenciamento de inscrições ou uma reformulação geral do portal.

## 2. Regras de negócio e decisões de produto

### 2.1 Matrícula, veteranos e escopo por oferta

O art. 11, V, na página 3, exige períodos de matrícula e ajuste de matrícula de **veteranos** dos cursos técnicos subsequentes e de graduação. O art. 11, VII tem o mesmo recorte de oferta para trancamento e cancelamento de componente. Esses dispositivos não devem fundamentar uma exigência automática dessas atividades para o técnico integrado.

| Atividade                                                     | Técnico integrado                                | Técnico subsequente                          | Graduação                                    | Pós-graduação            |
| ------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------- | -------------------------------------------- | ------------------------ |
| Matrícula/rematrícula de veteranos e ajustes, art. 11, V      | Não exigida por esse inciso; cadastro permitido  | Obrigatória                                  | Obrigatória                                  | Depende de norma própria |
| Trancamento e cancelamento de componente, art. 11, VII        | Não exigidos por esse inciso; cadastro permitido | Obrigatórios                                 | Obrigatórios                                 | Depende de norma própria |
| Matrícula de ingressantes                                     | Regra local/configuração de ingresso             | Regra local/configuração de ingresso         | Regra local/configuração de ingresso         | Norma própria            |
| Editais de transferência, reingresso e diploma, art. 11, VIII | Obrigatórios conforme a organização do curso     | Obrigatórios conforme a organização do curso | Obrigatórios conforme a organização do curso | Norma própria            |

Decisões:

1. Separar a matrícula de ingressantes (`registration-*`) da matrícula/rematrícula de veteranos (`enrolment-*`) e do ajuste (`adjustment-*`). Não exigir dois registros equivalentes para a mesma atividade de veteranos só por causa de nomes diferentes.
2. Aplicar a obrigatoriedade por par **atividade × oferta × período**. Um evento para subsequente não atende graduação, a menos que ambas estejam explicitamente abrangidas; o integrado em um calendário combinado não deve herdar a exigência do subsequente.
3. `secondSemesterIntake` não dispensa obrigações de veteranos. Migrar a configuração de ingresso para uma configuração por oferta e período, com três estados: não informado, há ingresso e não há ingresso. Ausência de informação nunca equivale a não haver ingresso.
4. A norma não fixa no inciso V a frequência da matrícula de veteranos. Não impor dois registros a um curso anual apenas porque o código atual cria `enrolment-1/2` e `adjustment-1/2`. Como decisão de produto, solicitar o período de matrícula do ciclo anual ou de cada semestre aplicável, sem atribuir essa frequência literalmente ao inciso V; ciclos administrativos adicionais dependem de regra local com fonte. A organização e os períodos são definidos por oferta conforme a seção 5.2.
5. Para novos calendários, ingresso não informado gera orientação para definir a configuração, sem afirmar descumprimento do inciso V. A falta de datas de matrícula de ingressantes só bloqueia se houver regra aplicável configurada com fonte; essa decisão e sua origem aparecem na interface e na revisão.
6. Atividades não exigidas por um inciso continuam disponíveis como opcionais. A dispensa automática decorrente da matriz normativa é diferente de uma declaração humana de não aplicabilidade, que continua exigindo responsável e justificativa.
7. Não tornar conselhos ou reuniões facultativos em 2027 só porque há essa regra no roteiro antigo: conferir os incisos XIII, XV e XVI da nova resolução. Qualquer exceção exige fonte própria, sem transportar automaticamente a dispensa atual por oferta.

O inciso VIII não traz o recorte de oferta dos incisos V e VII. Não dispensar seus editais automaticamente para o integrado; uma declaração de não aplicabilidade deve ter justificativa e revisão institucional próprias.

### 2.2 Três datas/conceitos independentes

| Conceito                        | Exemplo                            | Comportamento                                          |
| ------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| Ano do calendário em construção | 2027                               | Escopo do documento e dos dias letivos                 |
| Data real do evento/publicação  | Data comprovada de 2026 ou 2027    | Conservada integralmente, com fonte                    |
| Ano e período de ingresso       | 2027 anual, 2027/1, 2027/2 ou 2028 | Identifica a finalidade do edital; não altera sua data |

O prazo normativo é um quarto dado, calculado/consultado a partir da regra aplicável. Ele não preenche a data real de publicação. Quando a publicação ainda não ocorreu, permitir uma **previsão** explicitamente identificada; uma previsão não serve como comprovação de publicação realizada.

**Planejamento e execução são dimensões distintas.** Um calendário de 2027 pode ser concluído ainda em 2026 com publicações previstas para 2027. Uma previsão completa, com finalidade, ofertas, datas, fonte de planejamento e revisão humana, pode atender à obrigação de contemplar aquela atividade no calendário. Não exigir realização futura para concluir o planejamento. Uma referência a publicação anterior, por sua vez, precisa comprovar a ocorrência. A etapa 7 deve separar “planejamento completo” de “execução comprovada”, e o PDF deve manter essa distinção. Alterar previsão para realizada exige confirmação da data real e da fonte, gera nova versão e pode exigir nova revisão; nunca acontece automaticamente com a passagem do tempo.

- **Processo seletivo regular:** art. 10, página 3: publicação dos editais do Processo Seletivo 2028 até 15/06/2027, com possibilidade de ajuste pela Proens conforme o cronograma do certame. Mostrar a data prevista e a fonte de eventual ajuste, sem substituir a data registrada.
- **Transferência, reingresso e portador de diploma:** art. 11, VIII: periodicidade mínima anual para cursos anuais e semestral para semestrais, sempre antes do início do respectivo período. A data pode pertencer ao ano anterior. Vincular a verificação ao período de ingresso, não à posição de um semestre em uma lista ordenada.
- **Exemplo do pedido, publicação em dezembro de 2027 para ingresso em 2028:** conservar dezembro de 2027. Se for processo seletivo regular, sinalizar a necessidade de comprovar ajuste do prazo de 15/06/2027 pela Proens. Não considerar dezembro automaticamente regular nem alterar a data para junho.
- **Exemplo do pedido, publicação em 2026 para ingresso em 2027:** conservar a data comprovada de 2026 e permitir o vínculo ao ingresso de 2027. A referência só atende a obrigação correspondente se tipo de edital, oferta, período, fonte e situação da publicação forem compatíveis.

### 2.3 Fatos anteriores, novas ocorrências e intervalos

- Oferecer duas intenções: **Registrar atividade deste calendário** e **Referenciar fato anterior**. A primeira pode informar finalidade de ingresso futura; a segunda conserva uma ocorrência passada relevante ao calendário em elaboração.
- Referências anteriores são informativas (`kind: note`). Não podem adicionar/excluir dias, comprovar horas de formação/planejamento de 2027 ou substituir avaliações/férias/sábados do ano corrente. Podem atender somente requisitos cuja política aceite evidência anterior, inicialmente editais de ingresso e referências documentais sem obrigação vinculada. Essa defesa usa também a posição real das datas, independentemente do `recordType` recebido, para não permitir contorno pela troca do discriminador.
- Datas de períodos, etapas, férias, sábados e eventos que alteram dias letivos continuam sujeitas ao ano e às regras próprias. Não remover genericamente as restrições de `validateInterval`.
- Um intervalo informativo real que atravesse a virada do ano pode ser preservado, com indicação visual das partes anterior e atual. Não forçar duas datas fictícias para fazê-lo caber. Só eventos informativos podem usar esse caminho; efeitos na contagem continuam limitados ao ano, aos períodos e à regra correspondente.
- `recordType` expressa a intenção documental; a posição temporal é derivada das datas. Uma referência exclusivamente anterior termina antes de 01/01; uma referência que atravessa o ano inicia antes dessa data e termina dentro do ano do calendário. Ambas são informativas e usam a mesma lista positiva de requisitos aceitos. Registros inteiramente futuros, fora do ano do calendário, não entram neste fluxo; ingresso futuro é metadado, não deslocamento da publicação.
- Não impor um limite arbitrário que inviabilize uma fonte mais antiga; datas muito anteriores pedem revisão da pertinência, sem transformação automática. Para referências informativas, validar as duas pontas com `parseDate`, sem enumerar dias nem herdar o limite de 732 dias de `datesBetween`; esse limite permanece no núcleo que efetivamente enumera dias. O fluxo otimizado de PDF continua orientado ao ano imediatamente anterior.
- Não aceitar data inexistente, intervalo invertido ou incompleto como registro aplicado. Um item sem data confiável fica em preenchimento/pendência; nunca preencher 01/01, 31/12 ou o ano atual como substituto.
- `historicalSource` identifica procedência de um PDF, não define a natureza temporal do evento. Um evento digitado manualmente também pode ser referência anterior, e uma nova ocorrência pode ter sido preparada com auxílio do PDF anterior.

Invariantes para fechar as combinações de tipo, data e efeito:

| Registro                            | Datas permitidas e cobertura                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Evento com inclusão/exclusão letiva | Inteiramente no ano do calendário, com os limites de períodos e oferta já existentes                                                                                                                   |
| Evento informativo de planejamento  | Pode preceder o ano ou atravessar sua virada quando necessário ao planejamento, mas não ser inteiramente posterior ao ano do calendário; metadados distinguem previsto e realizado no caso dos editais |
| Referência documental anterior      | Começa antes de 01/01, termina antes dessa data ou durante o ano do calendário, é informativa e conserva fato comprovado; edital precisa estar realizado                                               |

Assim, ao elaborar 2027 em outubro de 2026, uma publicação prevista para novembro de 2026 pode constar como previsão informativa do planejamento. Ela não recebe o rótulo de fato anterior comprovado. Registros com parte das datas fora do ano só atendem requisitos autorizados pela política temporal; horas e etapas atuais exigem registros inteiramente no ano e no escopo pertinente.

### 2.4 Alinhamento complementar do roteiro de 2027

Implementar um conjunto de regras específico para 2027, sem substituir silenciosamente o de 2026. Estes pontos fazem parte da atualização porque o roteiro atual ainda usa o parecer de 2026:

| Base                            | Regra de 2027                                                                                                                                               | Local principal                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Arts. 4º e 8º                   | 200 dias anuais; 100 por semestre para organização semestral; período de referência de 01/02 a 17/12/2027, com início até 15/02/2027                        | Etapas 2 e 7                                    |
| Art. 11, XII                    | Plano de Ensino, PIT e RIT em cada semestre; não derivar essa frequência apenas do regime anual                                                             | Etapas 6 e 7                                    |
| Art. 11, XX e XXI               | Robótica até 31/08/2027 e Mostra de Cursos até 30/09/2027                                                                                                   | Etapas 6 e 7                                    |
| Art. 11, XXIV                   | Semana das Mulheres na segunda semana de março                                                                                                              | Etapas 6 e 7                                    |
| Art. 11, XXV                    | Semana da Ética e da Cidadania na primeira semana de maio                                                                                                   | Etapas 6 e 7                                    |
| Art. 11, XXVI e parágrafo único | Semana Cultural em outubro; as três semanas são obrigatórias nos técnicos e facultativas na graduação                                                       | Etapas 6 e 7                                    |
| Art. 12                         | JIFPR, SE²P²IN e outros eventos entram quando suas datas forem definidas                                                                                    | Base institucional e etapa 6                    |
| Art. 3º                         | Ajuste do Dia do Professor; prorrogação de prazos afetados por feriado municipal/recesso; alterações excepcionais com justificativa e deliberação da Proens | Regras compartilhadas, sem inventar autorização |

O significado operacional de primeira/segunda semana não está definido no PDF. Até existir critério institucional documentado, orientar a pessoa com o texto exato, validar o mês e manter a conferência humana da semana. Não escolher silenciosamente um intervalo civil. O prazo normativo pode ser registrado sem fabricar a data da atividade.

Não aplicar por extensão as metas e obrigações de 2027 à pós-graduação ou a calendários de outros anos. Para EaD/qualificação, registrar a limitação do modelo atual e exigir identificação do escopo antes de habilitar uma afirmação automática de conformidade; a criação de uma nova modalidade de ensino fica fora desta entrega.

## 3. Diagnóstico da implementação atual

| Ponto                        | Evidência no código                                                                              | Consequência para o plano                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Atividades e obrigatoriedade | `src/obligations.ts`, `src/release.ts`                                                           | Matrícula de ingressantes e configuração geral de segundo semestre; veteranos e ajustes gerados para os dois semestres; compartilhar uma política por oferta/período |
| Datas de eventos             | `src/calendar-edits/commands.ts`, `src/calendar-normalize.ts`                                    | Comando e normalização recusam eventos fora do ano; separar validação de eventos e períodos                                                                          |
| Sugestões do ano anterior    | `src/history-dates.ts`, `src/history-analysis.ts`, `src/history-progress.ts`                     | `proposedDates` troca o ano; cabeçalho perde o ano; detecção de itens existentes depende da proposta de datas                                                        |
| Roteiro da etapa 6           | `events/ActivityChecklist.tsx`, `sections/EventsSection.tsx`                                     | Lista longa, com eventos repetidos em roteiro/listagem; registro de qualquer oferta pode aparentar atendimento total                                                 |
| Edição de registros          | `events/EventEditorProvider.tsx`                                                                 | `prepare` escolhe o primeiro evento de uma obrigação; contexto apenas por `requirementId` não distingue vários registros/ofertas                                     |
| Rascunhos e gravação         | `events/event-draft.ts`, `forms/useCalendarForm.ts`, `session/editor-session.ts`                 | Preservar preenchimentos, identidade, confirmação de aplicação e confirmação do Convex                                                                               |
| Revisão normativa            | `src/review.ts`, `src/review-presentation.ts`, `src/review-export.ts`                            | Parte da identificação já menciona a Resolução 292, mas os critérios são de 2026; título novo não representa regra atualizada                                        |
| Base institucional           | `src/institution.ts`, `src/calendar-base/index.ts`, `convex/calendars/base.ts`                   | Datas iniciais de 2027 usam fonte SEI 4354987; a compatibilidade considera eventos/documentos e precisa considerar mudanças de regras                                |
| Persistência/importação      | `src/calendar-input.ts`, `convex/validators.ts`, `convex/calendars/model.ts`, `convex/schema.ts` | Formato atual `schemaVersion: 2`; parser/validators podem descartar novos campos; definir compatibilidade e conversão explicitamente                                 |
| Impressão                    | `src/printing/calendar-layout.ts`, `src/printing/types.ts`, `src/native-pdf.ts`                  | A grade mensal só imprime o ano atual; referências anteriores precisam de seção própria                                                                              |

Os caminhos de interface acima são relativos a `web/features/calendar-editor/`. Confirmar assinaturas antes de implementar: este inventário não congela arquivos em andamento.

## 4. Experiência proposta para a etapa 6

### 4.1 Estrutura e navegação

Manter o título **Atividades e datas do campus** e a rota `/calendarios/$calendarId/eventos`. A etapa não vira outra sequência obrigatória de passos.

Ordem de leitura:

1. Resumo curto por oferta: obrigações atendidas, pendentes e aguardando conferência. Separar preenchimento aplicado de gravação confirmada.
2. Busca por descrição; filtro de oferta; situação **Todas / Pendentes / Registradas / Opcionais / Conferência necessária**; assunto. Padrão inicial: todas as atividades aplicáveis, com pendências primeiro dentro dos grupos, sem ocultar registros do usuário.
3. Roteiro organizado em **Ingresso e vida acadêmica**, **Registros e prazos docentes**, **Atividades e semanas do campus** e **Outros eventos e impedimentos**. Etapas de avaliação permanecem na etapa 3, sem duplicar seus formulários na etapa 6.
4. Acesso secundário **Consultar calendário anterior**, recolhido inicialmente, com origem, ano e página visíveis ao expandir. Preservar a âncora `#calendario-anterior` e o endereço antigo `/historico`.
5. Consulta dos registros, com data completa, fonte, ofertas e situação temporal. Um mesmo evento não aparece duas vezes como se fossem dois registros independentes: o cartão da obrigação resume seus vínculos e abre o mesmo registro da listagem.

Esquema de hierarquia, sem determinar medidas ou cores antes da inspeção da UI existente:

```text
Atividades e datas do campus
Resumo por oferta: planejamento pendente / completo / a conferir
[Buscar] [Oferta] [Situação] [Assunto]       [Adicionar atividade]

Ingresso e vida acadêmica
  Matrícula de veteranos — ciclo/período — art. 11, V
  Subsequente: completo | Graduação: pendente | Integrado: opcional
  Registro 1: datas completas, fonte e ofertas          [Editar]
                                      [Adicionar outro registro]
  Painel do registro selecionado (um formulário ativo)

Registros e prazos docentes
Atividades e semanas do campus
Outros eventos e impedimentos
[Consultar calendário anterior]
[Consultar registros do calendário]
```

No mobile, resumo, filtros, cartão e painel seguem essa mesma ordem em uma coluna. O cartão não depende de uma tabela larga; links da revisão levam ao item e ao registro exatos.

Evitar carregar a tela com todos os formulários abertos. Cada grupo pode recolher seus itens por um controle acessível; ao abrir um item por link de pendência, expandir o grupo, revelar a linha mesmo que o filtro a escondesse e posicionar o foco. Contadores usam pares obrigação/oferta/período, não quantidade de eventos; itens opcionais não aumentam o denominador obrigatório.

### 4.2 Cartão de obrigação e múltiplos registros

Cada cartão mostra nome, fundamento curto (ex.: art. 11, V), período de referência, ofertas às quais se aplica e motivo de opcionalidade/pendência. Quatro dimensões independentes evitam estados contraditórios: **aplicabilidade** (obrigatório, opcional ou escopo a conferir), **cobertura do planejamento** (pendente, parcial ou completo), **conferência humana** (aguardando revisão ou revisado) e **execução** (previsto ou realizado com fonte). Um fato realizado pode aguardar revisão e uma previsão revisada continua prevista. “Referência anterior” é um marcador de procedência temporal, não um estado exclusivo que apaga uma pendência. Uma data preenchida não equivale a conformidade comprovada.

- Exemplo combinado: uma matrícula registrada só para subsequente mostra “Subsequente: registrado; Graduação: pendente; Integrado: não exigido por este inciso”.
- **Preencher atividade** prepara somente as ofertas pertinentes e o período da obrigação. O filtro de consulta não muda silenciosamente o escopo do formulário.
- Se houver múltiplos registros, listar cada um com ofertas, datas e ações **Editar**, **Remover** e **Adicionar outro período/evento**. Não editar automaticamente o primeiro.
- A mesma ocorrência pode abranger várias ofertas com datas iguais, desde que a política permita. Datas distintas exigem registros distintos. Não obrigar a duplicar um edital comum a várias ofertas.
- A exclusão atualiza apenas os pares atendidos por aquele registro; trocar oferta/tipo/período recalcula a cobertura antes da aplicação, sem apagar vínculos existentes.

### 4.3 Formulário de atividade e edital

Usar um painel associado ao item selecionado, com um único formulário ativo. Em desktop, painel na própria seção com largura confortável; em mobile, fluxo de uma coluna, título focável e ações ao final. Não acrescentar janela modal ou barra fixa se o fluxo não precisar delas; qualquer ação aderente deve reservar espaço e não cobrir campos, mensagens ou o teclado virtual.

Campos comuns: descrição, ofertas abrangidas, vínculo de atividade, início/término, fonte e efeito na contagem. A data aparece como `dd/mm/aaaa` na leitura; o formulário usa data civil sem conversão por fuso. Na criação livre, exigir escolha consciente do efeito em vez de assumir uma exclusão letiva para todo evento novo.

Para editais:

- Tipo: processo seletivo regular ou transferência/reingresso/portador de diploma.
- Finalidade: ano e período de ingresso; no conjunto de ofertas que compartilha o evento, período deve ter significado compatível. Usar ID estável do período quando ele já existe, e uma identificação explícita para ingresso futuro ainda sem calendário.
- Situação: **Publicação prevista** ou **Publicação realizada**. Para a primeira, rotular os campos como datas previstas; para a segunda, como datas reais, com fonte comprobatória.
- Natureza temporal: atividade atual ou referência anterior, com explicação curta e efeito informativo fixado para a referência.
- Prazo aplicável e origem como informação separada. Exibir eventual cronograma ajustado, fonte e estado de conferência. Não usar checkbox de confirmação do formulário como aprovação da Proens.
- Ajuda contextual: “O ingresso pode ocorrer em outro ano. Informe a data da publicação e identifique a turma/período a que o edital se refere.”

Para referência manual, permitir fonte textual ou URL/identificação de documento; não exigir upload de PDF. Se houver PDF histórico, preservar a procedência e disponibilizar a consulta sem perder o preenchimento.

Não pedir metadados de ingresso a feriados, reuniões ou outras atividades. A troca de tipo não pode eliminar valores preenchidos sem explicação e ação explícita. **Aplicar** continua sendo o comando local; **Fechar** conserva o rascunho; **Cancelar e descartar** limpa só o preenchimento ativo; a confirmação do Convex identifica a gravação concluída.

### 4.4 Uso do calendário anterior

Substituir a ação ambígua “Revisar e incluir” por uma escolha entre:

- **Referenciar esta ocorrência:** usar as datas originais quando reconhecidas com segurança, identificando sua origem, e pedir confirmação de pertinência ao calendário atual.
- **Preparar nova ocorrência:** reaproveitar descrição e contexto; deixar datas e fonte aplicável por preencher. Não copiar o dia/mês para o novo ano, inclusive em eventos recorrentes.

O extrator deve preservar ano explícito da linha e do cabeçalho. O ano declarado do documento pode ser usado como contexto identificado, nunca para sobrescrever ano explícito conflitante. Se há conflito entre linha, cabeçalho e cadastro, ou intervalo com anos insuficientes, mostrar o trecho e pedir datas completas. Carnaval, Páscoa, Corpus Christi e sábados continuam sem cálculo automático de novas ocorrências.

Análises antigas, sem ano preservado no cabeçalho, não permitem recuperar certeza inexistente: oferecer a reanálise controlada da seção 5.3 quando o PDF estiver disponível; caso contrário, mostrar pendência de conferência. Não modificar chaves de candidatos antigos em registros já vinculados. Ausência dos bytes originais mantém os metadados e o vínculo, com a orientação de restauração já existente.

Deduplicar pela ocorrência e sua cobertura, considerando datas reais, tipo, finalidade, ofertas e procedência. A mesma origem pode produzir uma referência e uma nova ocorrência em datas distintas. Não ocultar uma sugestão porque alguma oferta já foi atendida; informar a cobertura parcial e oferecer vincular o evento existente. Não fundir automaticamente documentos com mesmo título.

### 4.5 Acessibilidade, estados e URL

- Filtros de consulta ficam na URL, validados pelo Router; valores inválidos voltam a padrões seguros. Usar atualização funcional de `search` para preservar os demais parâmetros. Não adicionar dependência de validação só para poucos enums.
- Busca, oferta, assunto e situação são estado de consulta; valores do formulário pertencem ao TanStack Form. Não colocar fontes privadas, descrições de rascunhos ou campos de arquivos na URL.
- Voltar/avançar, recarregar, links da etapa 7 e rota antiga de histórico preservam destino e filtros válidos. Recarregar não promete recuperar rascunho em memória que não foi persistido; avisar ao sair quando houver preenchimento pendente, conforme o contrato atual.
- Teclado completo, foco visível, rótulos associados, erros por campo e resumo, estado não dependente de cor, contadores anunciados sem excesso de mensagens. Abrir e fechar devolve o foco à ação de origem; se ela não estiver visível, usar um destino estável.
- Mudança de filtro ou grupo não descarta o formulário ativo. Antes de editar outro registro, permitir retomar ou descartar o preenchimento existente.
- Estados explícitos para busca sem resultados, sem atividades aplicáveis, arquivo indisponível, análise falha, backend indisponível, gravação pendente, erro e conflito de versão. CAMPUS e ADMIN editam conforme autorização; PARECERISTA continua em consulta.

## 5. Arquitetura e contratos propostos

### 5.1 Política única por ano e escopo

Extrair de `src/obligations.ts`/`src/review.ts` uma política pura de requisitos por ano, oferta e período. Um módulo proposto `src/calendar-rules/` concentra o conjunto de 2027, a versão do conjunto, fundamentos e regras de cobertura. Preservar o de 2026 e retornar escopo não configurado para outros casos, sem supor conformidade.

Cada requisito precisa expressar: ID estável, fundamento, ofertas, período, obrigatoriedade e motivo, tipos de registro aceitos, se aceita referência anterior, frequência, prazos, horas/mês quando aplicáveis e nível de conferência. A regra de prazo conhece sua origem e possíveis ajustes documentados. Evitar booleanos contraditórios espalhados entre JSX e backend.

Um seletor puro retorna a situação e as evidências por par obrigação/oferta/período. O mesmo resultado alimenta roteiro, resumo, etapa 7, backend e relatórios. Separar **registro existente**, **cobertura**, **pendência objetiva** e **revisão humana**. IDs novos de requisitos recebem conversão explícita; não renomear em massa os antigos sem preservar vínculos.

Não mapear semestre por `periods.sort()[term - 1]` para editais. Usar vínculo semântico estável e validar a compatibilidade com a organização do curso. Excluir ou alterar um período vinculado deixa uma pendência visível; não reatribuir automaticamente o edital a outro.

### 5.2 Dados novos e versões

Os nomes abaixo são propostas de contrato para confirmar nos tipos durante a implementação:

| Dado                          | Contrato e responsabilidade                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `rulesetVersion`              | Versão das regras efetivamente usadas na revisão/readiness; não inferida apenas do texto da norma                   |
| `organizationByModality`      | Organização de cada oferta: anual, semestral ou a classificar; o antigo `regime` global torna-se resumo derivado    |
| Período com escopo            | ID estável, ofertas, ciclo/semestre e datas; associação definida ou a classificar para preservar o legado           |
| `intakeByModality`            | Mapa de oferta → períodos → estado de ingresso e fonte local, quando fundamentar exigência                          |
| `recordType`                  | Evento ou referência anterior; independente de `historicalSource` e do efeito `kind`                                |
| `publicationStatus`           | Prevista ou realizada, obrigatório para novos editais tipados                                                       |
| `admission`                   | Tipo de edital, ano de ingresso e período de destino; vínculo com período existente quando aplicável                |
| Ajuste de prazo               | Prazo ajustado, escopo e fonte; declarado pelo campus e conferido na revisão, sem simular autorização institucional |
| `historicalSource.analysisId` | Identidade imutável da análise/candidato que originou o registro; opcional somente na leitura legada                |

**Organização por oferta e períodos:** o formato v3 permite um ciclo anual para integrado e dois semestres para graduação no mesmo calendário. Os períodos podem coincidir no tempo se suas ofertas forem disjuntas; sobreposição continua proibida dentro da mesma oferta. Cada oferta anual tem um período anual, e cada oferta semestral tem dois períodos identificados como primeiro/segundo semestre. Um período pode abranger várias ofertas apenas se organização, identidade do ciclo e datas coincidirem. Não representar etapas de avaliação como períodos de aula sobrepostos.

`regime` deixa de ser fonte independente da regra: o servidor deriva `anual`, `semestral` ou `misto` do mapa por oferta para compatibilidade de apresentação; enquanto existir oferta a classificar, o resumo v3 fica explicitamente não definido e a UI mostra “Organização a conferir”. Não usar o `misto` antigo como substituto desse estado. Cálculo, frequência, férias aplicáveis, editais, duração e sugestões de etapas recebem os períodos da oferta selecionada. Revisar consumidores que hoje usam `state.periods` ou `state.regime` globalmente, incluindo `src/evaluation.ts`, `src/calendar.ts` nos adaptadores de entrada, `src/duration.ts`, `src/stage-suggestions.ts`, seletores de sábados, revisão e tabelas de impressão. O núcleo de contagem recebe somente períodos disjuntos de uma oferta, preservando sua premissa atual.

Na conversão v2, `anual` e `semestral` com configuração inequívoca podem associar os períodos às ofertas existentes, preservando IDs/datas e registrando a conversão. `misto`, quantidade inconsistente de períodos ou semestres sem identidade segura exigem classificação explícita na etapa 2; não multiplicar períodos nem atribuir frequência anual e semestral a todas as ofertas. Até essa classificação, manter consulta/edição recuperável, sinalizar contagem e cobertura como não confirmadas e bloquear somente a conclusão que dependa da organização. Cursos da mesma oferta com organizações diferentes continuam exigindo calendários separados; essa limitação deve aparecer na ajuda.

Para permitir esse salvamento intermediário sem inventar fatos, o contrato v3 admite `a-classificar` nas ofertas provenientes de conversão ambígua e uma associação de período `a-classificar`, sem ofertas/semestre atribuídos. Datas e IDs legados permanecem válidos, mas esses períodos não alimentam contagem nem cobertura até a classificação. Uma associação definida exige ofertas não vazias e identidade compatível do ciclo. No calendário novo, ainda sem períodos, a configuração pode permanecer ausente como preenchimento incompleto; conclusão exige todas as ofertas e associações pertinentes definidas.

Decisão de versionamento: emitir novas cópias no formato `schemaVersion: 3`; importar v2 mediante conversão explícita e auditável. Na persistência Convex, que hoje separa dados de cabeçalho de `contentState`, introduzir um discriminador de versão de conteúdo e leitores v2/v3; `domainState()` não pode continuar carimbando 2 em qualquer payload. Valores legados não confirmados são representados por ausência controlada ou um estado de conferência, não por uma afirmação nova de fato.

Sequência de compatibilidade: ausência do discriminador no conteúdo persistido identifica v2; primeiro habilitar leitores/validators dos dois formatos, inclusive snapshots; adaptar v2 em memória sem escrita na consulta; gravar v3 no próximo salvamento ou conversão explícita; conservar leitores v2 enquanto existirem snapshots/cópias correspondentes. DTOs distinguem a versão e seus estados pendentes, sem exigir que consumidores interpretem v3 como se fosse v2.

Um cliente antigo não pode enviar v2 e sobrescrever conteúdo já convertido para v3, descartando campos novos. Rejeitar essa gravação com erro de versão de cliente/conteúdo, preservar o preenchimento e orientar atualização. A importação explícita de uma cópia v2 usa o conversor e a prévia de alterações; não é um caminho de rebaixamento da versão persistida. Conversão, salvamento e adoção das regras respeitam o mesmo controle de concorrência.

Os novos campos passam juntos por tipos de domínio, parser, normalizador, comandos, validators Convex, DTOs/contratos, cópias, snapshots, importação, histórico e impressão. Não depender de spreads ou casts para persistir campos que o normalizador atual não lê. Aplicar limites de texto/lista/ano e rejeitar combinações ilegais, como referência com `include` ou horas usadas para satisfazer 2027.

### 5.3 Compatibilidade, migração e revisão

- Inventariar formatos e vínculos reais antes de escrever a migração; ensaiar somente em fixtures e, depois, ambiente autorizado. Não regravar automaticamente o acervo ao abrir uma tela.
- Um evento v2 conserva ID, datas, fonte, ofertas, vínculo e procedência. Não inferir ano de ingresso ou publicação realizada pelo nome do evento. Editais legados aparecem como “Classificação de ingresso a conferir” até confirmação.
- Para configuração antiga de ingresso: em uma única oferta, conservar o valor e indicar origem legada; em várias ofertas, mostrar o valor geral anterior como contexto e exigir confirmação por oferta antes de usá-lo para dispensar uma obrigação nova. Não multiplicar silenciosamente uma declaração ambígua.
- O adaptador de requisitos antigos deve mapear apenas equivalências inequívocas; manter evidências não classificadas consultáveis e pendentes. Nenhum evento é apagado por passar a opcional ou ter obrigação substituída.
- Snapshots e pareceres antigos são imutáveis. A leitura usa o adaptador correspondente; alterar um calendário gera nova versão. Converter um calendário não fabrica aprovação ou altera autoria histórica.
- Mudança das regras de 2027 deve tornar obsoleta a revisão que não avaliou essas regras, mesmo se versão do catálogo e datas não mudarem. Incluir a identidade/versionamento da política na verificação de revisão e na comparação da base, com uma categoria específica de mudança de regras. Não tratar como mera revisão numérica equivalente.
- A migração de identidade da base precisa tratar o prefixo `base-v1` atual: comparar conteúdos canônicos para não acusar mudança em todos os anos, mas exigir nova revisão quando as regras aplicáveis de fato mudarem. Revisões antigas sem identidade de regras não comprovam avaliação do novo conjunto.
- **Reanálise histórica:** o cache atual em `convex/actions/history.ts` e o retorno de análise prévia em `convex/histories.ts` precisam de alteração coordenada. A análise passa a ser imutável e identificada por `analysisId`, versão do extrator e hash dos bytes do PDF; uma nova versão gera outra análise, sem substituir a anterior. A ação de reanálise confere permissão, disponibilidade dos bytes e versão pretendida no servidor; retries da mesma combinação reaproveitam o resultado. A UI distingue análise consultada de análise mais recente.
- Antes de admitir múltiplas análises, fixar a associação legada de cada histórico à análise original existente. Fontes antigas sem `analysisId` resolvem essa associação, não “a análise mais recente”. Fontes novas carregam `analysisId`; `saveCalendar` valida histórico, análise e chave contra o mesmo candidato imutável. Adaptar índices, contratos, seleção de análise e consultas que hoje presumem uma única linha. Uma reanálise que não encontre o candidato antigo não impede salvar um evento já vinculado, nem apaga a evidência original. Remoção e limpeza não podem excluir análise ainda referenciada.
- Atualizar a fonte SEI da base inicial de 2027 após conferir equivalência das datas. Alterar `initialCatalogue()` não atualiza instalações existentes: planejar operação administrativa idempotente, prévia de diferenças e incorporação pelos calendários; nunca sobrescrever eventos locais ou base publicada ao iniciar o servidor.
- O PDF fornecido pode ser cadastrado como norma de aplicabilidade 2027 apesar da assinatura/publicação em 2026; não confundir o campo de ano de aplicabilidade documental com uma data real de publicação. A inclusão/publicação da norma é uma operação administrativa posterior, fora desta elaboração.

### 5.4 Backend, comandos e gravação

- Separar validadores de intervalo letivo, ocorrência informativa e referência. Reutilizar a política no comando `applyEvent`, na normalização/importação e no backend, inclusive em chamadas diretas sem UI.
- Registros previstos podem ser salvos no planejamento. Referências anteriores de publicação exigem situação realizada, datas completas e fonte; pendências normativas não impedem salvar trabalho válido estruturalmente, mas impedem afirmar atendimento/conclusão quando aplicável.
- O backend resolve a política vigente pelo ano e pelo escopo do calendário. `rulesetVersion`/identidade enviada pelo cliente descreve o que foi apresentado e serve à concorrência; não escolhe uma política antiga. Versão omitida, desatualizada ou forjada não pode rebaixar a validação. Adaptar um payload v2 não seleciona automaticamente as regras de 2026 para um calendário de 2027.
- Manter autorização por campus/perfil, controle de versão, identidade da base e confirmação de atualização. Históricos/análises devem pertencer ao calendário e ao campus; períodos pertencem ao calendário e abrangem a oferta indicada. Documentos institucionais podem ser globais: exigir acesso e compatibilidade de escopo, sem exigir propriedade local. Não confiar em IDs recebidos.
- Falha ou conflito da mutation conserva rascunho e contexto do evento. Falha de PDF não desfaz evento já gravado; repetição de salvar não duplica registros. Sincronização reativa não substitui valores sujos por dados assíncronos.
- Conferir ações operacionais de conclusão, exportação e parecer para que nenhuma use a política antiga enquanto o editor usa a nova. Preservar o protocolo de manutenção, filas e identidades de funções agendadas existentes.

### 5.5 Visualização, PDF e parecer

- Eventos de 2027 permanecem na grade mensal de 2027. Um edital de 2027 para ingresso em 2028 mostra essa finalidade junto à descrição e sua situação prevista/realizada.
- Registros informativos fora da grade aparecem em seção **Atividades e referências de outros anos**, separando **Publicações previstas** de **Fatos anteriores com fonte**, com datas completas, finalidade, ofertas e fonte; não criar um mês de 2026 dentro da grade de 2027. Uma previsão de novembro de 2026 ao elaborar 2027 aparece como previsão, sem rótulo de fato comprovado.
- Intervalos informativos que atravessam o ano aparecem nessa seção e, na parte de 2027, com a data integral identificada. O modelo de impressão não pode sugerir que todo o intervalo ocorreu naquele mês; previsto/realizado permanece explícito.
- Distinguir visualmente prazo de referência, previsão de publicação e publicação realizada. Não apresentar uma data de prazo da base como prova de que o edital foi publicado.
- Parecer e exportação da revisão identificam norma, conjunto de regras e pendências de conferência. Não reaproveitar o número romano de 2026 para uma obrigação diferente de 2027 sem conversão explícita, principalmente XXV/XXVI.
- Conteúdo textual e URLs são escapados; título longo, múltiplas ofertas, fontes extensas, ausência de referências e quebra de página precisam de verificação visual. Não usar cor como único indicador.

## 6. Etapas do editor afetadas

| Etapa                           | Entrega                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1. Semana letiva                | Preservar o fluxo e testar ausência de regressão                                                                  |
| 2. Períodos letivos             | Ingresso por oferta/período e orientação da janela de 2027; períodos com identidade para os vínculos              |
| 3. Etapas de avaliação          | Consumir a política compartilhada nos itens relacionados; preservar edição e contagem das etapas                  |
| 4. Sábados letivos              | Preservar restrições e contagem; referências anteriores nunca liberam um sábado                                   |
| 5. Férias docentes              | Preservar restrições e 45 dias; referência anterior não satisfaz férias atuais                                    |
| 6. Atividades e datas do campus | Novo roteiro, cobertura por oferta, formulário contextual, fatos anteriores, nova ocorrência e consulta histórica |
| 7. Revisão e conclusão          | Mesma política da etapa 6, links para corrigir o item exato, revisão atualizada e saída completa                  |

## 7. Sequência de implementação e critérios de saída

### Fase 0 — Fixar a matriz e os casos de referência

- [x] Conferir o estado atual dos arquivos e as mudanças de base institucional em andamento.
- [x] Reexecutar `pnpm exec intent list` e carregar as skills locais pertinentes antes de editar cada preocupação. Intent ausente é dependência pendente; não baixar substituto.
- [x] Formalizar matriz da seção 2, IDs de requisitos e severidade de cada verificação; registrar como pendentes de decisão institucional as interpretações não definidas no PDF.
- [x] Inventariar dados v2 e chaves de revisão sem acessar produção nesta fase de desenvolvimento.
- [x] Criar regressões no fluxo real afetado: calendário integrado bloqueado por matrícula de veteranos e evento de 2026 recusado no editor/normalizador. Confirmar a falha antes da correção quando viável.

**Saída:** casos mínimos reproduzíveis, matriz rastreável ao artigo e nenhuma hipótese não documentada apresentada como obrigação normativa.

### Fase 1 — Regras, cobertura e contratos

- [x] Implementar política 2027, preservando 2026 e escopos sem norma configurada.
- [x] Implementar organização/períodos por oferta e a classificação explícita do legado `misto`; filtrar os períodos antes da contagem e do cálculo de frequência.
- [x] Introduzir formato v3 e adaptadores v2; alinhar todos os limites de entrada/saída.
- [x] Implementar cobertura por oferta/período, editais tipados, previsto/realizado e referências sem efeito letivo.
- [x] Separar prazos de datas de ocorrência; implementar vínculo semântico aos períodos e pendências de ajustes documentados.
- [x] Definir a identidade de regras e a obsolescência de revisão com testes que diferenciem mudança semântica de revisão numérica.

**Saída:** funções puras e importação preservam datas/metadados, regra por oferta funciona sem UI e referências não alteram dias/horas atuais.

### Fase 2 — Persistência, compatibilidade e análise histórica

- [x] Carregar a skill Convex antes de editar `convex/`; aplicar object-form, argumentos/retornos validados, autorização e consultas por índices.
- [x] Integrar validators, contratos, conteúdo, snapshots e endpoints; conferir os contratos locais via TypeScript e testes sintéticos. As declarações geradas existentes importam os módulos e refletem os novos exports sem regeneração remota.
- [ ] Validar publicação/codegen em um desenvolvimento individual autorizado. Não executado nesta autorização exclusivamente local; sem acesso a produção.
- [x] Introduzir leitores de snapshots legados e conversão idempotente, sem reescrever pareceres históricos.
- [x] Preservar ano explícito de linha/cabeçalho na análise; versionar a análise e manter chaves/procedência antigas.
- [x] Implementar reanálise com cache por hash/versão, identidade imutável e resolvedor de fontes legadas; atualizar consultas que hoje retornam apenas a primeira análise.
- [x] Atualizar deduplicação para cobertura parcial e intenções diferentes, sem duplicar eventos na repetição do comando.
- [x] Ensaiar atualização da fonte institucional e das regras com comparação de impacto; a aplicação administrativa real fica para operação autorizada posterior.

**Saída:** integração sintética confirma persistência e round-trip, isolamento por campus, falhas recuperáveis e revisões antigas identificadas corretamente.

### Fase 3 — Etapa 2 e reconstrução da experiência da etapa 6

- [x] Antes de alterar formulários, conferir exports/tipos da versão instalada de `@tanstack/react-form`, composição oficial e valores assíncronos, conforme `AGENTS.md`. Usar `useCalendarForm`/`useDraftForm`; não introduzir controle paralelo dos mesmos valores.
- [x] Implementar configuração de ingresso por oferta/período e sua origem, sem dispensar veteranos por ausência de ingresso.
- [x] Implementar filtros validados na URL, grupos, resumo e cartões com cobertura parcial e fundamento.
- [x] Implementar painel único de edição com seleção explícita entre vários eventos, situação de publicação, finalidade e referência anterior.
- [x] Implementar as duas ações no PDF anterior; preservar consultas, rascunhos, procedência e retorno do foco.
- [x] Verificar desktop e mobile, teclado, foco, filtros vazios, textos longos, múltiplas ofertas e backend indisponível. Tratar arquivos com identidade privada na instrumentação; conservar apenas campos permitidos pelo hook compartilhado.

**Saída:** uma pessoa completa os dois exemplos recebidos pelo editor, sem artifícios de data e com feedback correto de aplicação e gravação.

### Fase 4 — Etapa 7, visualização e PDF

- [x] Substituir validações divergentes por resultados da política compartilhada e oferecer links estáveis para corrigir cada pendência.
- [x] Atualizar critérios, identificação de norma/conjunto e conversão das revisões antigas.
- [x] Implementar apresentação das referências anteriores e metadados de ingresso na visualização e no modelo de impressão.
- [x] Inspecionar imagens dos PDFs, quebras de página e escape de conteúdo; executar o runtime PDF real em Linux ou Docker local.

**Saída:** roteiro, backend, revisão e documentos concordam sobre os mesmos registros; ausência de revisão válida não aparece como conclusão aprovada.

### Fase 5 — Documentação e validação de entrega

- [x] Atualizar `docs/uso.md`, `docs/componentes-interface.md`, `docs/arquitetura-convex.md` e, se necessário, o guia de migração. README continua como apresentação e ponto de entrada.
- [x] Registrar limitações de interpretação, exemplos, conversão de cópias, revisão invalidada e operação de atualização da base.
- [x] Executar as verificações locais disponíveis da seção 8, rever diferenças visuais e registrar resultados e pendências.
- [x] Obter `pnpm check` integralmente aprovado no estado compartilhado após a conclusão/correção do trabalho externo de release/migração. Aprovação registrada na rodada de correções de arquitetura abaixo; as tentativas anteriores são mantidas como histórico.
- [x] Revisar o diff final para confirmar que nenhum procedimento passou a depender de Bash, caminho macOS/Linux ou utilitário ausente no Windows.

**Saída:** documentação vigente, `pnpm check` aprovado, runtime PDF aprovado e evidências das plataformas efetivamente executadas; validações ausentes são pendências, não aprovações presumidas.

## 8. Matriz de validação e aceite

### 8.1 Casos de domínio, contrato e backend

| Caso                                                                                 | Resultado esperado                                                                                                                      |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Calendário integrado sem matrícula/ajuste de veteranos                               | Não bloqueado pelo art. 11, V                                                                                                           |
| Subsequente/graduação sem atividades exigidas                                        | Pendência para a oferta e o período pertinentes                                                                                         |
| Calendário combinado com evento só para subsequente                                  | Subsequente atendido, graduação pendente, integrado sem exigência indevida                                                              |
| Ingresso no segundo semestre ausente em uma oferta e presente em outra               | Configurações independentes; rematrícula não dispensada                                                                                 |
| Regime anual                                                                         | Não criar duas obrigações de veteranos sem fundamento; PE/PIT/RIT permanecem semestrais                                                 |
| Integrado anual junto a graduação semestral                                          | Frequências e contagens próprias; períodos coincidentes entre ofertas permitidos, sobreposição dentro da mesma oferta recusada          |
| Legado `misto` sem escopo de períodos                                                | Datas/IDs conservados; classificação solicitada antes de confirmar contagem/conclusão, sem aplicar anual e semestral a todas as ofertas |
| Publicação realizada em 2026 para ingresso em 2027                                   | Datas preservadas em comando, gravação, recarga, cópia e PDF; cobertura só do edital compatível                                         |
| Publicação em dezembro de 2027 para ingresso em 2028                                 | Data preservada; se regular, pendência de ajuste do prazo pela Proens, nunca conversão para junho                                       |
| Prazo da base em 15/06/2027 sem publicação cadastrada                                | Não tratado como edital publicado                                                                                                       |
| Edital de transferência em data igual/posterior ao início do destino                 | Pendência objetiva; publicar antes exige data estritamente anterior                                                                     |
| Previsão de edital                                                                   | Identificada como previsão; pode compor planejamento, não comprova realização                                                           |
| Calendário de 2027 concluído em 2026 com publicações futuras                         | Planejamento completo após revisão, sem exigir comprovação de execução futura; passagem do tempo não muda status                        |
| Publicação prevista para novembro de 2026 ao elaborar 2027 em outubro de 2026        | Previsão informativa permitida e identificada, sem ser tratada como referência já realizada                                             |
| Referência anterior com `include`, `exclude`, horas anuais ou vínculo a etapa/férias | Recusada ou vínculo recusado, tanto no comando quanto na chamada direta ao backend                                                      |
| Intervalo informativo atravessando o ano                                             | Datas integrais preservadas e representação explícita, sem alterar dias letivos                                                         |
| PDF com ano na linha diferente do cabeçalho/cadastro                                 | Não sobrescrever ano; exigir conferência quando contraditório                                                                           |
| PDF sem ano suficiente, análise antiga ou original indisponível                      | Pendência explícita; nenhum ano inventado                                                                                               |
| Reanálise não encontra um candidato anteriormente vinculado                          | Fonte antiga continua resolvível; calendário pode ser salvo/consultado sem perder a procedência                                         |
| Nova ocorrência a partir de PDF                                                      | Datas vazias até preenchimento; origem mantida; não copiar ano/dia/mês                                                                  |
| Candidato já atendido em apenas uma oferta                                           | Cobertura parcial visível; possibilidade de completar, sem duplicação automática                                                        |
| Mesma origem usada como referência e nova ocorrência                                 | Dois registros distinguíveis, sem ocultação indevida                                                                                    |
| Cópia v2, v3 e snapshot antigo                                                       | Conversão preserva dados, rejeita combinações inválidas e não altera o original                                                         |
| Apenas mudança de regra de 2027                                                      | Revisão anterior obsoleta mesmo sem mudança de catálogo; outros anos não ganham falsa mudança                                           |
| Cliente envia identidade de regras omitida, antiga ou forjada                        | Servidor não permite rebaixar a política vigente nem confirmar revisão desatualizada                                                    |
| Usuário sem permissão/campus incorreto                                               | Mutação recusada; referência não contorna autorização                                                                                   |
| Documento institucional global e histórico de outro calendário                       | Documento global acessível pode ser referido; histórico alheio é recusado                                                               |

Acrescentar datas impossíveis, ano bissexto, intervalo invertido, referência muito antiga, fonte ausente, edital com finalidade incompatível e múltiplos períodos para a mesma obrigação. Datas exatas em fixtures são sintéticas e identificadas; não se tornam datas padrão do produto.

Testar também gravação por cliente v2 contra calendário v3 (recusada sem perda de dados), importação explícita v2 convertida para v3, duas conversões concorrentes e um conflito de versão durante a confirmação de classificação legada.

### 8.2 UI e navegação

Ampliar as suítes existentes em `test/browser/editor-forms.spec.ts`, `editor-regressions.spec.ts`, `editor-event-drafts.spec.ts`, `editor-session.spec.ts`, `calendar-reference.spec.ts`, `editor-wizard.spec.ts`, `review-ui.spec.ts` e as referências visuais pertinentes; criar arquivo específico se o conjunto ficar mais claro. Reutilizar fixtures reais do editor e backend sintético.

Cobrir o fluxo completo **abrir obrigação → escolher oferta/tipo/período → preencher → aplicar → confirmar gravação → recarregar → revisar → exportar**. Testar também edição do segundo de vários registros, remoção parcial, voltar/avançar, filtros via link direto, `search` inválido, retorno à âncora histórica, trocar filtro com rascunho ativo, valores assíncronos, conflito de versão e retry após falha sem duplicação.

Desktop e mobile precisam confirmar foco e controles desobstruídos, sem rolagem horizontal causada pelo painel; formulários e fontes longas não podem expandir a largura da página. PARECERISTA consulta sem ações de escrita. Estados opcionais, pendências e referência anterior devem ser compreensíveis sem cor.

### 8.3 Comandos e plataformas

Durante a implementação, começar pelas menores suítes que exercitam o comportamento alterado, por exemplo:

```sh
pnpm exec vitest run test/campus-obligations.test.ts test/history-dates.test.ts test/release.test.ts test/calendar-edits.test.ts
pnpm test:browser test/browser/editor-forms.spec.ts test/browser/calendar-reference.spec.ts test/browser/editor-event-drafts.spec.ts
```

Adicionar os testes novos aos comandos direcionados; testes do normalizador, compatibilidade, Convex e PDF também são obrigatórios quando seus módulos forem alterados. O comando de release é:

```sh
pnpm check
```

Como o modelo de impressão será alterado, executar também `pnpm test:runtime` em Linux ou `pnpm test:runtime:linux` com Docker Desktop e containers Linux no Windows/macOS. Inspecionar as imagens antes de atualizar referências intencionais e rodar novamente a comparação sem atualização. Não ampliar tolerâncias ou contornar a interação para obter aprovação.

Windows é ambiente suportado. Validar instalação, desenvolvimento, tipos, testes de navegador/unitários e build pelo PowerShell; referências visuais `win32` devem ser produzidas e revistas no próprio ambiente. Se Windows, Docker ou navegador não estiverem disponíveis, registrar exatamente o que ficou pendente. Não criar GitHub Actions nem exigir segunda suíte de navegador em Docker; a regra atual está em [Verificação](../verificacao.md).

Nenhum comando acima autoriza E2E remoto, publicação ou migração de dados compartilhados. Integração real exige opt-in explícito, conferência do destino e dados exclusivos conforme o guia; produção permanece bloqueada para a suíte.

## 9. Riscos e decisões que exigem fonte institucional

| Risco/decisão                                             | Tratamento planejado                                                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Confundir ingresso com matrícula de veteranos             | Separação explícita de atividades, fontes e cobertura; nenhum requisito novo atribuído indevidamente ao inciso V |
| Exigir frequência de matrícula que a resolução não fixa   | Seguir os períodos do curso e admitir regra local documentada; não impor dois semestres ao regime anual          |
| Entender primeira/segunda semana de formas diferentes     | Texto normativo e conferência humana até definição operacional documentada                                       |
| Tratar um cronograma informado como autorização da Proens | Registro da fonte e revisão responsável; não marcar aprovação por checkbox ou regex                              |
| Publicação anterior atender férias, horas ou etapa atual  | Lista positiva dos requisitos que aceitam referência e defesa no domínio/backend                                 |
| Converter cópias antigas e perder procedência/parecer     | Adaptadores por versão, ID estável, histórico imutável e classificação pendente                                  |
| Política nova deixar parecer antigo aparentemente válido  | Identidade de regras integrada à validade da revisão, com migração de `base-v1` testada                          |
| Melhorar a lista e perder rascunhos ao filtrar/navegar    | Router para consulta, Form para preenchimento, contexto por evento e testes de foco/sessão                       |
| Escopo de EaD/pós-graduação não representado pelo modelo  | Não atribuir conformidade automática; norma própria e conferência de escopo                                      |

Estas decisões não impedem desenvolver contratos, UX e testes. Impedem somente automatizar uma conclusão normativa que dependa da informação ausente. A interface deve indicar o que falta e permitir salvar o planejamento sem fabricar fatos.

## 10. Revisões do plano e verificação desta entrega documental

As revisões avaliam o plano; não autorizam sua execução. Realizadas em 26/10/2026.

### Revisão independente por subagente

Revisão somente leitura com consulta ao código e à resolução. Os achados foram incorporados e o subagente fez duas releituras das correções. Na última, não identificou pendências adicionais entre os pontos levantados; a confirmação é de coerência documental, não de implementação.

| Achado                                                                     | Decisão incorporada                                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Conclusão de calendário prospectivo poderia exigir realização futura       | Planejamento e execução separados; previsão pode completar planejamento, sem comprovar publicação |
| Regime global não representa integrado anual e graduação semestral         | Organização e períodos por oferta, limites explícitos e migração do legado misto                  |
| Reanálise poderia perder candidato usado por evento existente              | Análises imutáveis, identidade por análise e associação legada preservada                         |
| Versão enviada pelo cliente poderia escolher regras antigas                | Servidor resolve política vigente; identidade recebida serve à concorrência                       |
| Intervalo cruzando ano não tinha tipo/limite definidos                     | Invariantes de tipo/data, classificação temporal derivada e validação sem enumerar referências    |
| Documento institucional global poderia ser bloqueado por propriedade local | Acesso/escopo para documentos globais; propriedade para históricos e períodos                     |
| Estados de revisão, execução e cobertura poderiam se contradizer           | Quatro dimensões independentes e marcador temporal adicional                                      |
| Legado pendente não cabia no contrato v3                                   | Estados a classificar, resumo não definido e leitores v2 preservados                              |
| Previsão anterior ao ano poderia sumir do PDF                              | Seção externa à grade distingue previsões de fatos anteriores                                     |

### Verificação documental

- Descoberta do Intent local concluída; orientação de parâmetros de busca do Router carregada para o desenho dos filtros.
- Caminho relativo para o guia de verificação e caminhos principais do inventário conferidos.
- Formatação conferida com `pnpm exec prettier --check docs/plans/calendario-2027-ofertas-referencias-e-etapa-6.md`, após a redação final.
- A rodada documental anterior alterou somente o plano. `pnpm check`, testes funcionais, navegador, runtime PDF e validação Windows não foram executados nesta rodada documental; sua execução na implementação está especificada na seção 8. A dispensa da suíte completa nesta rodada segue `AGENTS.md`.

## 10. Registro da implementação local

### Fase 0 — 26/10/2026

- Estado inicial: alterações alheias em `test/browser/editor-forms.spec.ts` e nos componentes/CSS de sábados, além de `SaturdayPrerequisites.tsx` novo. Preservadas. A política de equivalência da base já consta do código atual, sem diff local nesses módulos no início desta execução.
- Intent instalado disponível: 3 pacotes e 17 skills; carregadas as skills locais de Router, incluindo parâmetros de busca para a UI. Orientação Convex carregada antes das mudanças de backend.
- Inventário sintético: conteúdo persistido v2 sem discriminador; `domainState()` e snapshots carimbavam versão 2. Revisões possuíam `baseIdentity` opcional `base-v1`, sem identidade de regras. Históricos usavam uma análise por arquivo, chaves `JSON([page, excerpt])` e fontes sem identidade de análise. Nenhuma consulta a produção ou migração de acervo.
- Regressões em `test/calendar-2027-phase0.test.ts`: execução inicial de `pnpm exec vitest run test/calendar-2027-phase0.test.ts` confirmou **2 falhas esperadas**. O integrado recebia quatro pendências de veteranos; o comando de evento recusava a data original de 2026 antes de chegar à normalização.

Matriz de severidades usada na implementação:

| Família de IDs                                              | Fundamento/escopo                                        | Verificação                                                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `enrolment-*`, `adjustment-*`, `withdrawal-*`               | Art. 11, V/VII; subsequente e graduação, ciclo da oferta | Pendência objetiva quando obrigatório; integrado opcional; pós com escopo não configurado                |
| `registration-*`                                            | Regra local de ingresso por oferta/período               | Orientação se configuração ausente; bloqueio de cobertura somente com exigência e fonte locais           |
| `admission-notice-*`                                        | Art. 11, VIII; oferta e destino semântico                | Pendência por par; referência realizada aceita; data estritamente anterior ao período                    |
| Processo seletivo regular                                   | Art. 10; ingresso 2028                                   | Prazo separado 15/06/2027; ajuste exige fonte e conferência; data real nunca é corrigida automaticamente |
| `teaching-plan-*`, `pit-*`, RIT                             | Art. 11, XII                                             | Frequência semestral independente da organização anual                                                   |
| Conselhos e reuniões                                        | Art. 11, XIII/XV/XVI                                     | Sem transportar dispensa de 2026 para 2027                                                               |
| `women-week`, semana de ética/cidadania, `cultural-week`    | Art. 11, XXIV–XXVI                                       | Técnicos obrigatórios, graduação opcional; conferir mês e semana humana                                  |
| Robótica, Mostra                                            | Art. 11, XX/XXI                                          | Prazo objetivo 31/08 e 30/09/2027                                                                        |
| Forma, intervalo e efeito de referências                    | Contrato estrutural                                      | Rejeitar datas inválidas, futuro integral, efeito letivo, horas/etapas/férias anteriores                 |
| Organização ambígua, semana institucional, EaD/qualificação | Decisão institucional ausente/limitação de modelo        | Pendência explícita; nenhuma conformidade inferida                                                       |

O significado de primeira/segunda semana, dispensas excepcionais, datas ainda indefinidas do art. 12 e eventual cronograma Proens ajustado permanecem sujeitos a fonte e conferência institucional. A resolução foi tratada apenas como fonte de requisitos.

### Fases 1 e 2 — contratos e persistência

- Política pura em `src/calendar-rules/`, identidade `consup-292-2027-v1`, cobertura por par atividade/oferta/ciclo e preservação do roteiro de 2026. Anos sem conjunto configurado e pós-graduação ficam explicitamente pendentes.
- Conteúdo v3 com mapa de organização, associação semântica de períodos, ingresso por oferta/ciclo, escopo com fonte, edital tipado, execução e referência anterior. O resumo global é derivado. A conversão semestral v2 só associa ciclos quando os nomes permitem identificação segura; datas/IDs ambíguos permanecem recuperáveis.
- Comando, normalização/importação e backend compartilham os limites de referência e inclusão por oferta. Um registro não ganha cobertura em 2027 por omitir ofertas; uma referência não comprova horas/etapas/férias/dias atuais.
- Prazos de referência do art. 3º, § 2º aceitam extensão somente com causa municipal explícita e fonte. Robótica/Mostra, previstos no art. 11, não recebem essa extensão por inferência. Ajuste Proens com data/fonte alimenta a cobertura objetiva, e o critério do parecer precisa de confirmação humana atual; um booleano do evento não simula autorização.
- Persistência v2/v3, bloqueio de rebaixamento e identidades de base/regras, conversão concorrente e snapshots imutáveis testados com `convex-test`. Consultas não migram dados. Adoção das regras de 2027 invalida revisão antiga; outros anos mantêm a identidade canônica `base-v1`.
- Extrator 3 conserva ano de linha/cabeçalho e contexto declarado, sem substituir conflitos. Análises são imutáveis por identidade/hash/versão; fontes legadas resolvem a original, fontes novas exigem `analysisId`. Chaves novas distinguem linhas iguais em cabeçalhos diferentes; chaves legadas não são reescritas. Manifesto pequeno de metadados evita carregar todos os corpos de análise na consulta.
- Regressões de campus/ofertas divergentes, análise alheia, candidato removido em reanálise, cache/retry concorrente, regras forjadas/omitidas e inclusão fora do período de uma oferta foram exercitadas sem backend remoto.

### Fase 4 — impressão e base

- Fonte da base inicial atualizada para a Resolução 292/SEI 4422750 após conferir SHA-256 e equivalência das datas do art. 2º com o original. `preview2027SourceUpdate` ensaia a troca de fonte de modo puro/idempotente e protege conteúdo local divergente. Nenhuma instalação existente foi atualizada remotamente.
- Modelo compartilhado de impressão conserva finalidade, situação, datas integrais, fontes escapadas e intervalo cruzando o ano; seção externa à grade separa previsões e fatos anteriores. Tabelas usam períodos da oferta e identidade semântica dos semestres.
- Prévia sintética de quatro páginas renderizada e inspecionada, incluindo grade, intervalo integral, referências antigas, múltiplas ofertas, título/fonte longos, escape de conteúdo, cabeçalho de tabela repetido e quebras sem cortar linhas. Artefatos locais de inspeção ficam em `.temp/print-2027/` e não são dependência do produto.
- `pnpm test:runtime:linux` aprovado no Docker local: 3/3 testes, runtime final em 16,00 s (mais preparação/instalação do container). Inclui geração concorrente, A4, escape/bloqueio de rede e referências previstas/realizadas. A prévia inspecionada usa o mesmo modelo; o teste Linux usa o Chromium serverless real.

### Verificações intermediárias

- `pnpm exec vitest run test/calendar-2027-phase0.test.ts`: falhas esperadas antes da correção, depois aprovado.
- Suítes direcionadas de domínio/contrato/histórico/Convex executadas antes da suíte completa; resultados verdes registrados pelos agentes. Regressões de UI usam componentes, formulários e CSS reais com backend sintético.
- `pnpm test:unit` fora do sandbox restrito: 68 arquivos e 344 testes aprovados em 2,90 s nessa revisão intermediária. Tentativas anteriores dentro do sandbox falharam ao abrir servidores loopback (`EPERM`); não foram contadas como aprovação.
- `pnpm lint`, `pnpm lint:types`, `pnpm typecheck` e `pnpm agents:check`: aprovados em conferência intermediária. `git diff --check` e formatação dos guias alterados: aprovados.
- Referências visuais em inspeção/atualização intencional; `pnpm check` final ainda pendente neste registro intermediário.
- Windows indisponível neste host macOS: não houve validação PowerShell/Chromium Windows. Nenhum script de produto novo depende de Bash ou caminhos específicos de macOS/Linux. E2E remoto, deploy, migração de acervo, publicação da norma e operação administrativa de troca de fontes não executados, por estarem fora da autorização local.

### Fase 3 — interface e referências visuais

- Etapa 2 permite organização/associação e ingresso por oferta, identificação de escopo e classificação explícita de v2. Criação anual/semestral conserva a escolha declarada em mapa explícito; misto permanece a classificar.
- Etapa 6 tem consulta na URL, grupos, resumo por oferta, cobertura parcial e painel único. A preparação de veteranos seleciona ofertas obrigatórias pertinentes; a escolha de ofertas opcionais continua disponível. Edição/remoção identifica cada registro, sem editar automaticamente o primeiro. Rascunhos e contexto sobrevivem aos filtros e navegação.
- Dois exemplos de edital exercitados com metadados: publicação de 2026 para ingresso de 2027 e dezembro de 2027 para ingresso de 2028. Histórico permite ocorrência original com análise exata ou nova ocorrência sem datas; anos ambíguos permanecem pendentes.
- Conferência humana usa critério/revisão atual independentemente da cobertura objetiva. Mudança do conjunto limpa confirmações do rascunho de revisão, conserva notas identificadas como contexto e preserva versões anteriores.
- Intenção visual inspecionada antes de atualização; comparação final sem atualização aprovada em macOS: 20/20 testes desktop/mobile em 12,5 s. Novas referências cobrem adoção de regras legadas e organização pendente. Nenhuma tolerância ampliada.
- Suítes direcionadas de navegador: 14/14 fluxos 2027/histórico/rascunhos/referência e 29/29 formulários/base/2027 aprovados; sessão unitária 15/15. Esses resultados não substituem a execução geral final.

### Tentativas de validação geral

- Primeira execução de `pnpm check`: formatação, lint, lint com tipos e tipos app/Convex aprovados; interrompida em `scripts/release-contracts.ts` do trabalho externo de release, cuja declaração não incluía `path`/`method` já usados para rotas HTTP. A declaração foi completada no trabalho concorrente; a adição temporária equivalente desta execução foi removida para preservar aquela atualização, sem alterar o fluxo. `pnpm typecheck:tools` aprovado após a integração.
- `pnpm test` subsequente: 345 testes aprovados e 5 falhas nos arquivos externos `test/deploy-production.test.ts` e `test/environments.test.ts`, enquanto a refatoração de release continuava em andamento (export `assertBackendUnchanged` ausente, comando sintético inesperado e fixture sem `scripts/release-backend.ts`). Não se alteraram as asserções ou a implementação desse fluxo para obter aprovação. A etapa de navegador não é executada quando a etapa unitária desse comando falha; iniciada separadamente com `pnpm test:browser`.
- A aprovação de `pnpm check` permanece pendente até a conferência completa do estado final compartilhado. Windows continua não verificado por indisponibilidade de host; nenhum resultado de macOS/Linux é apresentado como aprovação dessa plataforma.

### Resultado final local — 26/10/2026

| Verificação                                                            | Resultado                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                           | Executado repetidamente; última execução em 17:19:50: formatação, lint, lint com tipos, todos os TypeScript e Intent aprovados. Vitest: **373 aprovados e 1 falha externa** em 3,14 s. O comando interrompe antes do navegador/build quando Vitest falha. **Não aprovado globalmente.** |
| Domínio, contratos, backend, histórico, sessão e impressão afetados    | Seleção final de 15 arquivos: **77/77 aprovados** em 728 ms. Inclui os novos arquivos de regressão v3, referência anterior, fonte institucional e política de 2027.                                                                                                                     |
| `pnpm test:browser`                                                    | **135/135 aprovados**, 1,6 min, no código final. Inclui 20 testes visuais desktop/mobile sem atualização, navegação, rascunhos, teclado, foco, controles desobstruídos, consulta do parecerista e zero gravações em modo leitura.                                                       |
| `pnpm test:runtime:linux`                                              | **3/3 aprovados** em Docker/Linux, 16,00 s de suíte, além da instalação/preparação. Chromium serverless real, A4, geração concorrente, escape/bloqueio de rede e referências de outros anos.                                                                                            |
| `pnpm build`                                                           | **Aprovado** após os últimos ajustes de UI/CSS. Log local em `.temp/build-2027-final.log`. Avisos de diretivas `use client` de dependências não interromperam o build.                                                                                                                  |
| Formatação dos guias alterados e `git diff --check`                    | **Aprovados**.                                                                                                                                                                                                                                                                          |
| Windows/PowerShell e referências visuais Windows                       | **Não executados**: host Windows indisponível. macOS e Docker/Linux não comprovam essa plataforma.                                                                                                                                                                                      |
| Navegador visual Linux                                                 | **Não executado**: validação visual local feita em macOS; referências Linux não foram copiadas nem atualizadas sem inspeção nesse sistema.                                                                                                                                              |
| E2E remoto, deploy/codegen remoto, migração e publicação da base/norma | **Não executados**: autorização desta entrega é local; E2E remoto requer opt-in próprio.                                                                                                                                                                                                |

Falha global restante: `test/release-migrations.test.ts:133`, no teste externo de retomada de lote sob novo proprietário, espera erro `/pendente/` e recebe “Uma identidade de migração já publicada não pode mudar de definição.” O arquivo e a implementação de release/migração foram introduzidos/modificados em paralelo por trabalho externo a esta entrega. A sua intenção não foi substituída para obter aprovação; o log da última checagem fica em `.temp/check-2027-final.log`. A aprovação integral do bloqueio de release permanece pendente.

A execução geral de navegador detectou e levou a corrigir/adaptar quatro casos antes de ficar verde: seletor de prévia passou a identificar o link pelo nome acessível entre os novos links de pendência; fixture v3 de sábados passou a declarar associação de período; o foco após fechar/descartar foi conferido na ação de origem, conforme o contrato do plano; a rolagem por teclado ganhou espaço inferior para exibir integralmente o campo PDF no mobile. As verificações de visibilidade de 100%, `elementFromPoint`, controles desabilitados e ausência de gravação foram preservadas. A apresentação das ofertas em uma coluna também foi corrigida e testada; nenhuma tolerância visual foi ampliada.

As alterações iniciais de sábados e as alterações externas posteriores foram preservadas. Não houve reset, descarte, commit, alteração de dados remotos ou execução operacional de publicação.

### Correções dos dois achados da revisão de arquitetura — 26/10/2026

Implementação iniciada pelo módulo normativo, com preservação do trabalho compartilhado.

- O vínculo entre atividade e critério agora é metadado estável (`reviewCriterionId`) da política de 2026/2027. A apresentação da citação não decide esse vínculo. A cobertura compartilhada resolve a conferência humana e a aplicabilidade por oferta; o cartão não extrai incisos com regex nem usa `required` global para instruir ofertas opcionais. O parecer associa cobertura pela identidade do critério, e a prontidão reutiliza o mesmo resultado de aplicabilidade. Matrícula de ingressantes permanece sem vínculo presumido ao critério de veteranos; anos sem política continuam sem critério inferido.
- `historicalOccurrence` concentra a resolução das datas originais com ano do documento e versão da análise selecionada. O detector de registros existentes recebe essa ocorrência resolvida, também usada no preenchimento da referência. Contexto ausente, extrator antigo e conflito de anos continuam pendentes. O fluxo mantém finalidade, ofertas, ingresso e análise exata, exigindo confirmação para vincular procedência ao evento manual; não duplica o registro nem desloca datas para o ano atual.
- Regressões confirmadas antes da correção: teste de parecer falhou ao alterar somente a apresentação da citação; os quatro testes de cartão falharam em desktop/mobile; teste de histórico e dois fluxos de navegador falharam ao reconhecer ano somente no cabeçalho. Depois das correções, as seleções direcionadas passaram: 29 testes de política/parecer/prontidão, quatro testes de cartão, dez de histórico/datas e dez fluxos de navegador de 2027/histórico.
- O novo fluxo de histórico aciona o vínculo por teclado, confere foco e título visível, verifica ausência de gravação antes da confirmação e confirma identidade, datas, fonte manual e único registro após salvar. As regressões de análise antiga/conflitante impedem recuperar datas sem contexto confiável.
- Intent local consultado e orientação de Router carregada antes das edições. Aplicados os princípios de módulos profundos e o checklist `vercel:react-best-practices`: política derivada no domínio, consumidores com menos decisões, resolução pura e compartilhada, sem novo estado/efeito React para duplicar dados derivados.
- Comparação visual inicial: 18 aprovações e duas diferenças no formulário de evento por deslocamento após remover a ajuda redundante. Imagens esperadas, atuais e diferenças inspecionadas em desktop/mobile. Apenas as duas referências `calendar-editor-event.png` de macOS foram atualizadas; nenhuma tolerância foi alterada. A comparação sem atualização faz parte da nova execução integral abaixo.

Verificação final das correções:

| Comando / escopo                                          | Resultado                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                              | **Aprovado**, saída 0. Formatação, lint, análise de tipos, todos os TypeScript, Intent e build aprovados; **379/379 testes unitários em 71 arquivos** e **141/141 testes de navegador**. As falhas externas registradas nas tentativas anteriores não se repetiram no estado compartilhado atual. Log local: `.temp/check-review-fixes.log`. |
| Comparação visual dentro de `pnpm check`, sem atualização | **20/20 aprovados** em desktop/mobile macOS, após inspeção e atualização restrita às duas referências citadas.                                                                                                                                                                                                                               |
| Fluxos reais de UI                                        | Aprovados: teclado, foco, controles desobstruídos, navegação/URL, rascunhos, parecer atual de 2026, ofertas opcionais/obrigatórias de 2027 e vínculo explícito de histórico sem duplicação.                                                                                                                                                  |
| `git diff --check` e formatação do plano                  | **Aprovados**.                                                                                                                                                                                                                                                                                                                               |
| Runtime PDF                                               | Reutilizado o resultado **3/3 aprovado** de `pnpm test:runtime:linux` desta implementação, registrado acima: estas duas correções não alteraram o modelo, gerador, recursos ou dependências de impressão.                                                                                                                                    |
| Windows e E2E remoto                                      | **Não executados**: host Windows indisponível; E2E remoto sem opt-in. Não contam como aprovação. Nenhum script ou dependência de plataforma foi introduzido nestas correções.                                                                                                                                                                |

Preservados os trabalhos em andamento, inclusive compatibilidade institucional e release/migração. Nenhum reset, descarte, commit ou operação remota foi realizado.

### Validação antes do commit solicitado — 26/10/2026

Após conferir a autoria pelo estado inicial da Fase 0 e pelos commits existentes de compatibilidade institucional, sábados e release, foram preparados explicitamente apenas os 120 arquivos desta implementação e das correções de arquitetura. Os trabalhos alheios já incorporados ao histórico não fazem parte deste diff.

Nova execução de `pnpm check` no estado compartilhado atual: **aprovada**, saída 0, com **388/388 testes unitários em 72 arquivos**, **145/145 testes de navegador**, comparação visual desktop/mobile sem atualização e build. Log: `.temp/check-2027-commit.log`. A diferença de contagem em relação à rodada anterior inclui testes do trabalho externo já incorporado ao histórico. Formatação do plano e `git diff --cached --check` também conferidos. Permanecem as limitações de Windows e E2E remoto registradas acima; o resultado de runtime PDF é reutilizado porque seus arquivos não mudaram desde a verificação.
