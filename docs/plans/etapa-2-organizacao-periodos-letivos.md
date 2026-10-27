# Proposta: organização da etapa 2 — períodos letivos

**Situação:** investigação e proposta em 27/10/2026; implementação não iniciada.

**Recomendação:** manter as sete macroetapas e dividir a etapa 2 em três abas: **Organização**, **Datas dos períodos** e **Ingresso**. A ordem orienta o primeiro preenchimento; as abas permitem voltar diretamente ao assunto necessário durante a revisão.

**Escopo da investigação:** código e testes locais, incluindo alterações em andamento na etapa 6. O estado local não comprova a interface publicada. Esta proposta não modifica formulários, regras, dados ou navegação da aplicação.

**Ampliação do pedido:** avaliar salvamento automático durante as alterações, aproveitando a infraestrutura do Convex. A recomendação é introduzir autosave para unidades pequenas e válidas, retirando botões genéricos de aplicação onde não representam uma decisão de domínio. Criação de registros e alterações estruturais continuam com ações que explicam sua consequência.

## 1. Diagnóstico

A etapa 2 reúne três tarefas diferentes em uma única tela, todas abertas ao mesmo tempo:

| Bloco atual                   | Pergunta que resolve                                    | Conteúdo visível                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organização por oferta        | Como cada oferta organiza o ano e qual norma se aplica? | Em 2027, escopo da norma e fonte; um seletor anual/semestral/a conferir por oferta; avisos de classificação legada; ação própria de aplicação.                    |
| Períodos letivos              | Quando acontecem as aulas?                              | Lista de períodos com editar/remover; formulário aberto com ofertas, ciclo, nome, início, quantidade opcional de dias e término; mensagens de cálculo automático. |
| Ingresso por oferta e período | Há novos estudantes e uma regra local de matrícula?     | Para cada combinação oferta/ciclo: situação do ingresso, fonte e declaração de exigência local; ação própria de aplicação.                                        |

Fontes: [composição da etapa 2](../../web/features/calendar-editor/sections/PeriodsSection.tsx), [organização](../../web/features/calendar-editor/forms/OrganizationForm.tsx), [períodos](../../web/features/calendar-editor/forms/PeriodForm.tsx) e [ingresso](../../web/features/calendar-editor/forms/IntakeForm.tsx).

O volume de ingresso cresce com as ofertas e suas organizações. Um calendário com técnico integrado anual e graduação semestral já apresenta três combinações, com nove controles só nesse bloco. Além do volume, a tela mistura configuração normativa, datas e regras de ingresso. O título e a descrição da etapa enfatizam início e término, embora ela também peça as outras decisões. Essa diferença de expectativa é uma inferência de UX baseada nos campos e no [texto da navegação](../../web/features/calendar-editor/editor-steps.ts).

Uma inspeção exploratória com a fixture sintética que carrega os componentes reais encontrou:

| Cenário sintético                                                    | Controles `input`/`select` | Altura da seção em 1440 px | Altura da seção em 390 px |
| -------------------------------------------------------------------- | -------------------------- | -------------------------- | ------------------------- |
| Uma oferta anual                                                     | 12                         | 1.447 px                   | 2.164 px                  |
| Técnico integrado anual, subsequente semestral e graduação semestral | 28                         | 3.084 px                   | 3.932 px                  |

No segundo cenário, apenas Ingresso ocupa 1.901 px no desktop e 2.043 px no mobile. São medidas da seção, não da página inteira. A inspeção das capturas de desktop com uma oferta e mobile com múltiplas ofertas reforça a hipótese de sobrecarga por repetição. Essa observação local não é um teste de usabilidade com pessoas nem aprovação da suíte visual.

Há dependências reais entre os blocos:

- Organização determina se cada oferta tem ciclo anual ou primeiro/segundo semestre. O cadastro de períodos exige associação compatível e impede duplicar um ciclo da mesma oferta.
- Alterar a organização pode deixar associações de períodos existentes como **a classificar**. O comando preserva IDs e datas; a interface precisa tornar essa consequência visível.
- Ingresso usa os mesmos ciclos e influencia a aplicabilidade de matrícula dos ingressantes na etapa 6. **Não informado** permanece diferente de **Não há ingresso**.
- Quantidade de dias ativa o término automático, dependente da semana letiva e dos impedimentos registrados. Não se trata apenas de outra maneira de preencher a mesma data.

Fontes: [`configureOrganization` e `applyPeriod`](../../src/calendar-edits/commands.ts), [`applicabilityFor`](../../src/calendar-rules/index.ts), [formulário de ingresso](../../web/features/calendar-editor/forms/IntakeForm.tsx) e [formulário de períodos](../../web/features/calendar-editor/forms/PeriodForm.tsx).

## 2. O que aproveitar da etapa 6

O [plano de refatoração da etapa 6](etapa-6-refatoracao-ui-ux.md) prevê hierarquia por assunto, detalhes progressivos, editor perto da ação de origem e preservação dos valores existentes. O código local em andamento já avança para três abas: **Atividades**, **Eventos do campus** e **Calendário anterior**. A aba fica na URL, os painéis usam `hidden` mantendo o conteúdo montado e os controles têm `tablist`, `tab`, `tabpanel` e navegação por setas, Home e End. Fontes: [EventsSection](../../web/features/calendar-editor/sections/EventsSection.tsx) e [validação da busca](../../web/app/search.ts).

A referência útil para a etapa 2 é a divisão por tarefa e a preservação do preenchimento ao trocar de assunto. O estado de uma aba não deve ser confundido com aplicação dos dados ou confirmação de salvamento.

## 3. Alternativas consideradas

| Alternativa                                                | Benefício                                                                                  | Custo / limite                                                                                                                                               | Parecer                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Três macroetapas no lugar da etapa 2                       | Orienta uma tarefa por página.                                                             | O roteiro passa de sete para nove etapas; muda a numeração das etapas seguintes, rotas, navegação e links. As revisões frequentes ganham mais deslocamentos. | Reservar para o caso de uso real revelar necessidade de orientação obrigatoriamente sequencial. |
| Três abas dentro da etapa 2                                | Separa as tarefas e mantém acesso direto na revisão; acompanha a direção local da etapa 6. | Exige indicar pendências de preenchimento nas abas ocultas e tratar as dependências entre elas.                                                              | **Recomendada.**                                                                                |
| Somente blocos recolhíveis                                 | Alteração menor e visão dos três assuntos.                                                 | Preserva uma página longa e permite reabrir todos os formulários ao mesmo tempo.                                                                             | Usar dentro de Ingresso para muitas ofertas, como complemento.                                  |
| Mover organização para a etapa 1 e ingresso para a etapa 6 | Reduz o volume imediato da etapa 2.                                                        | Afasta organização das datas que ela condiciona e a configuração de ingresso da estrutura de ciclos; amplia outras telas.                                    | Não propor nesta intervenção.                                                                   |

A contagem atual de sete etapas está centralizada em [editor-steps](../../web/features/calendar-editor/editor-steps.ts) e faz parte dos fluxos verificados em [editor-wizard](../../test/browser/editor-wizard.spec.ts). A opção por abas é uma decisão de produto proposta, não uma restrição técnica do repositório.

## 4. Organização recomendada

```text
Etapa 2 de 7 · Períodos letivos
Defina a organização das ofertas, as datas de aulas e o ingresso.

[Organização] [Datas dos períodos] [Ingresso]

Conteúdo de um assunto por vez
Indicação de preenchimento pendente nas demais abas, quando houver

Voltar à semana letiva                 Continuar para etapas de avaliação
```

### Organização

- Escopo da norma e fonte, quando aplicáveis ao ano.
- Organização anual ou semestral por oferta.
- Avisos de classificação legada somente quando pertinentes.
- Organização sem registros dependentes é candidata a autosave validado. Quando a troca reclassificar períodos, usar uma ação com impacto explícito, por exemplo **Alterar organização e revisar períodos**. Oferecer **Ir para datas dos períodos** como navegação separada; ver seção 6.
- Se a organização mudar, apresentar quais períodos ficaram com associação a conferir e um atalho para corrigi-los. Preservar IDs, datas e registros existentes.

Manter a escolha explícita da organização, mesmo com uma única oferta. Uma única oferta não permite deduzir se o ciclo é anual ou semestral.

### Datas dos períodos

- Lista compacta dos períodos existentes, com nome, datas, oferta/ciclo e indicação de término automático quando ativo.
- Ação **Adicionar período** e edição junto ao item escolhido. O formulário deixa de permanecer aberto depois da lista quando não há criação ou edição em curso; no estado vazio, o cadastro pode aparecer diretamente.
- Uma única oferta elegível pode ser apresentada como contexto, sem checkbox redundante. A seleção real continua disponível quando há várias; na edição, preservar o escopo gravado até alteração explícita.
- Na criação, oferecer os ciclos compatíveis com o escopo escolhido. Na edição, um valor legado ou incompatível continua visível como **a corrigir**, preservado no rascunho até escolha explícita. Se nenhuma organização aplicável estiver definida, explicar a dependência e oferecer **Configurar organização**; não aplicar uma organização presumida.
- Nome, início e término compõem o caminho normal. O cálculo por dias aparece por escolha explícita: **Informar término** ou **Calcular por dias letivos**. Preservar `targetDays` na edição e o recálculo quando impedimentos mudarem.
- Ação **Adicionar período** na criação. Na edição, nome pode usar autosave; datas, escopo e cálculo também, depois de validar o conjunto ao sair do grupo. Exibir o resultado do recálculo e permitir desfazer por nova operação. Confirmar adicionalmente apenas consequências estruturais concretas, como remover uma automação; não exigir confirmação só porque as datas alteram a contagem. Cancelar descarta somente o que ainda não foi aplicado.

O formato dos dados e as validações atuais permanecem: um ciclo por oferta, associação explícita, sobreposição permitida entre ofertas independentes e proibida no mesmo escopo. A mudança de apresentação do cálculo não deve introduzir um segundo mecanismo de datas.

### Ingresso

- Introdução curta: informar se há ingresso; registrar a regra de matrícula quando existir. As datas de matrícula continuam sendo registradas na etapa 6.
- Uma seção por oferta, com ciclo anual ou primeiro/segundo semestre conforme a organização aplicada.
- Com várias ofertas, lista de resumos por oferta/ciclo e edição de uma unidade por vez. Oferta ou ciclo **não informado** precisa continuar visível no resumo, sem parecer concluído. Evitar abrir outra grade completa dentro da aba.
- Pergunta principal **Há ingresso de novos estudantes?**, preservando as três situações existentes.
- Fonte e regra local junto do ciclo correspondente. Reduzir a explicação repetida; detalhes normativos e contexto legado podem ficar em **Entenda esta configuração** e avisos contextuais.
- Autosave por oferta/ciclo, quando o conjunto situação/fonte/regra for válido. Evitar uma aplicação que reenviaria os valores antigos de todas as ofertas. Não apagar fontes ou declarações existentes ao recolher uma seção, mudar de aba ou mudar a resposta. Se houver valores incompatíveis, revelá-los e explicar a correção necessária.
- Orientar **Ir para atividades de matrícula** depois de aplicar, quando útil, sem transformar o atalho em cadastro automático de evento.

## 5. Navegação, preenchimento e salvamento

1. **Entrada previsível.** Sem indicação na URL, abrir Organização. Links específicos de revisão, de sábados sem períodos ou de correção devem abrir a aba e o item pertinentes. Acessar uma aba não obriga a preencher as anteriores.
2. **URL como estado de navegação.** Usar uma chave validada própria da etapa 2, por exemplo `periodosAba=organizacao|datas|ingresso`. O nome é proposto; a chave genérica `aba` já é usada pela etapa 6 e os links atuais conservam a busca. A nova seleção não deve mudar a aba lembrada da etapa 6.
3. **Troca de aba preserva campos.** Manter os formulários montados ou elevar sua propriedade a um nível persistente. Continuar usando o hook compartilhado e a identidade de rascunho por calendário/formulário. Não criar outro armazenamento para os mesmos valores.
4. **Navegação independente.** Trocar de aba, usar um atalho ou continuar para a etapa 3 não deve aplicar silenciosamente outros formulários. Hoje, o continuar da etapa 2 já é navegação, e os três formulários têm ações próprias. Na proposta de autosave, a unidade válida é aplicada por sua própria alteração; valores incompletos continuam no formulário. Mostrar **Ainda não salvo** com ação **Retomar** na aba correspondente, sem bloqueio modal a cada troca.
5. **Estados precisos.** Distinguir campos em preenchimento, dados aplicados aguardando salvamento, erro de gravação e salvamento confirmado. Um selo de seção configurada não significa conformidade normativa ou confirmação do Convex. Contadores devem representar os dados aplicados, com indicação separada para o rascunho.
6. **Dependências sem perda silenciosa.** Se a organização aplicada mudar enquanto houver ingresso ou período em edição, conservar o preenchimento e indicar o conflito. Antes de aplicar, revalidar contra a organização atual. Não reutilizar automaticamente os valores anuais como primeiro semestre nem descartar segundo semestre ao trocar para anual.
7. **Teclado e mobile.** Três abas com nomes curtos, estado selecionado e navegação por setas/Home/End; painéis ocultos fora da ordem de foco. Links de pendência abrem o painel antes de posicionar o foco. Testar 390 px e 1440 px, com ações e mensagens desobstruídas.

Fontes do contrato existente: [layout e continuar](../../web/features/calendar-editor/CalendarEditorLayout.tsx), [useCalendarForm](../../web/features/calendar-editor/forms/useCalendarForm.ts), [useDraftForm](../../web/shared/forms/useDraftForm.ts), [regressão de rascunho](../../test/browser/editor-regressions.spec.ts) e [instruções de arquitetura](../../AGENTS.md). A mudança de organização com formulário dependente em edição é um caso a verificar na implementação; esta investigação não afirma que o comportamento atual já o resolve.

## 6. Salvamento automático: viabilidade e limites

### Infraestrutura existente

O calendário já tem autosave depois de aplicar um formulário. [`createEditorSession.apply`](../../web/features/calendar-editor/session/editor-session.ts) executa o comando puro sobre o estado atual, marca a alteração e agenda a gravação. [`createAutosaver`](../../web/autosave.ts) agrupa alterações por 1.500 ms, serializa os envios, distingue estados de gravação e bloqueia erros de autenticação ou conflito de versão. A confirmação considera o snapshot enviado; mudanças posteriores permanecem pendentes.

O ponto que ainda exige botão é a passagem dos valores do TanStack Form para o estado do calendário. [`useCalendarForm`](../../web/features/calendar-editor/forms/useCalendarForm.ts) faz essa passagem no submit e redefine o baseline local antes da resposta remota. Remover o botão, isoladamente, não cria a política de quando um conjunto de campos pode virar um calendário válido.

As consultas reativas atualizam os dados recebidos pela sessão. Se houver edição local ou formulário em preenchimento, a sessão preserva esses valores e expõe a versão remota para resolução. Isso não constitui mesclagem colaborativa campo a campo. No servidor, [`saveCalendar`](../../convex/calendars.ts) recebe o estado completo, verifica versão, recalcula, arquiva a versão anterior e registra auditoria para cada mudança efetiva. Enviar uma mutation por tecla aumentaria esse custo e a frequência de conflitos.

A documentação do Convex descreve [atualizações otimistas](https://docs.convex.dev/client/react/optimistic-updates) como mudanças locais temporárias e [OCC/atomicidade](https://docs.convex.dev/database/advanced/occ) como garantias transacionais. A conclusão para este projeto é uma inferência apoiada também no código: essas garantias não substituem validação dos grupos de campos nem resolvem automaticamente o conflito de versão de domínio que `saveCalendar` retorna. A resposta do servidor continua sendo o marco de **Salvo**.

### Matriz recomendada

| Caso                                                                              | Política proposta                                                                                               | Motivo                                                                                                              |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Nome de período existente e outros textos independentes                           | Autosave após edição válida, ao sair do campo ou pela fila existente.                                           | Não exigem recriar o registro nem reclassificar seu escopo.                                                         |
| Ingresso por oferta/ciclo                                                         | Autosave da unidade situação/fonte/regra, quando válida.                                                        | `required` depende de ingresso confirmado e fonte; os três campos formam uma unidade.                               |
| Escopo da norma e fonte                                                           | Autosave do par válido.                                                                                         | Não enviar status afirmado sem a fonte exigida.                                                                     |
| Organização sem períodos dependentes                                              | Candidata a autosave validado.                                                                                  | Não existe ainda um conjunto de períodos para reclassificar.                                                        |
| Organização com períodos dependentes                                              | Mostrar consequências e confirmar o conjunto quando houver reclassificação.                                     | A alteração pode afetar períodos, contagens e atividades aplicáveis.                                                |
| Novo período                                                                      | Manter **Adicionar período**, sem outro botão Salvar.                                                           | Criar é uma ação intencional, com identidade e campos obrigatórios.                                                 |
| Datas, ofertas, ciclo e meta de período existente                                 | Autosave do conjunto válido ao sair do grupo, via `applyPeriod` e fila atual, com recálculo visível e desfazer. | Evita salvar entre a edição do início e a do término. A contagem mudar não exige, por si só, confirmação adicional. |
| Semana letiva, férias, sábados, aplicação de etapas sugeridas e vínculo histórico | Avaliar em fluxos próprios; conservar ações intencionais nesta proposta.                                        | Há confirmação de decisão, inclusão/remoção de registros ou aplicação em lote.                                      |
| Conclusão, importação e substituição                                              | Conservar ação explícita e confirmação prevista.                                                                | Não são edição de um campo.                                                                                         |

### Contrato para o piloto

- Manter valores incompletos ou inválidos no Form, com **Ainda não salvo**. Não enfraquecer o schema canônico para gravar cada estágio transitório.
- Aplicar apenas a unidade alterada e válida sobre o estado atual via comando puro. Não reenviar um `IntakeForm` inteiro baseado em defaults antigos de outras ofertas e não aplicar rascunhos de abas ocultas como efeito de navegação.
- Reutilizar a fila de 1.500 ms; não somar outro atraso de 1.500 ms no formulário. Definir um único responsável por agrupar as gravações.
- Distinguir, por bloco quando houver mistura, **Ainda não salvo**, **Salvando**, **Salvo**, **Erro ao salvar** e conflito. Uma unidade salva não pode esconder outra incompleta.
- Preservar o controle de versão, a serialização, a retenção de alterações durante um envio e os fluxos de recuperação. Reabrir ou resolver versão remota continua necessário quando o contrato atual retornar conflito.
- Uma edição já autosalva não é revertida por **Cancelar**. Se houver desfazer, ele precisa ser uma nova operação validada; rótulos e testes devem refletir essa diferença.
- O rascunho atual é um `Map` em memória do [provider compartilhado](../../web/shared/forms/drafts.tsx). Recuperar campos incompletos após recarregar exige uma evolução distinta de persistência de rascunho, opcional e com modelo próprio. Autosave do calendário válido não garante essa recuperação.

**Decisão sugerida:** adotar autosave incremental na mesma revisão de experiência, começando por ingresso por oferta/ciclo, escopo/fonte e edição de períodos existentes em grupos válidos. Tratar mudanças estruturais concretas por ações com consequência explícita. Remover os botões genéricos progressivamente, após os testes comprovarem estados transitórios, falhas e concorrência.

## 7. Implementação sugerida

1. **Abas e navegação.** Separar os três blocos preservando os formulários existentes; validar URL, histórico, atalhos, rascunhos e leitura sem edição. Atualizar a descrição da etapa e indicadores de pendências. Essa fase entrega a principal redução de volume, sem depender da mudança de salvamento.
2. **Editor de períodos.** Exibir cadastro/edição por demanda, perto da ação de origem. Depois, simplificar escopo único e tornar explícita a escolha entre término manual e cálculo por dias.
3. **Ingresso e dependências.** Resumir por oferta/ciclo e introduzir expansão progressiva; verificar organização alterada com rascunho dependente e atualização remota. Antes de ocultar campos, fixar a preservação e os erros nos testes.
4. **Piloto de autosave.** Aplicar por unidade válida em Ingresso, escopo/fonte e edição de períodos existentes, aproveitando fila e confirmação atuais. No grupo de datas, não gravar o estado intermediário enquanto a pessoa passa do início ao término. Testar edição rápida, valores inválidos, perda de conexão, falha, resposta atrasada, troca de aba e conflito remoto antes de expandir o padrão.

Não há necessidade identificada de alterar schema, backend ou modelo de impressão para a primeira fase. Antes de editar formulários, cumprir a consulta à versão instalada e às regras oficiais de composição/valores assíncronos do TanStack Form, conforme o `AGENTS.md`.

## 8. Critérios de aceitação e validação futura

- Continuam existindo sete macroetapas, com os assuntos da etapa 2 acessíveis diretamente.
- Nenhum fluxo exige percorrer três telas para corrigir apenas uma data.
- Técnico anual e graduação semestral conservam períodos independentes e sobrepostos entre ofertas; a matrícula de ingressantes continua condicionada a status, regra e fonte. Base: [editor-2027](../../test/browser/editor-2027.spec.ts).
- Classificação de períodos legados preserva IDs e datas. Base: [editor-2027](../../test/browser/editor-2027.spec.ts).
- Criar/editar um período, impedir sobreposição no mesmo escopo e recalcular término por dias continuam funcionando. Bases: [editor-forms](../../test/browser/editor-forms.spec.ts) e [editor-regressions](../../test/browser/editor-regressions.spec.ts).
- Trocar abas, sair/voltar à etapa, usar histórico do navegador e receber atualização remota preservam os contratos de rascunho. Falha de gravação não vira selo de salvo.
- Autosave não envia grupos inválidos, não sobrescreve outra oferta com valores antigos e não cria um período só porque o usuário começou a digitar. Alterações durante um envio permanecem pendentes até confirmação própria.
- Links de sábados sem períodos, pendências e revisão abrem a aba correta; erros em conteúdo recolhido o revelam e levam o foco ao controle.
- Leitura por parecerista exibe os dados das três abas sem permitir gravação.
- Desktop/mobile e teclado verificados na suíte local, incluindo comparação visual das alterações intencionais. Executar as menores suítes afetadas durante o desenvolvimento e `pnpm check` antes de concluir código, conforme [Verificação](../verificacao.md).

**Validação desta entrega:** descoberta Intent executada e orientação local de Router/search params consultada; fontes e referências conferidas no checkout e na documentação oficial do Convex. Formatação deste arquivo conferida separadamente. Inspeção exploratória da etapa 2 com fixture local em 1440/390 px, sem backend remoto. Executado pelo agente principal: `pnpm exec vitest run test/autosave.test.ts test/editor-session.test.ts`, com **21 testes aprovados em dois arquivos**. Esse resultado verifica a infraestrutura atual e não aprova a proposta ainda não implementada. Não houve alteração de UI, operação remota ou publicação; `pnpm check` completo é dispensável para esta entrega somente documental.
