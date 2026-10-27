# Plano: refatoração de UI/UX e do formulário da etapa 6

**Situação:** aprovado e implementado localmente em 27/10/2026 (seção 10), sem commit. Registrado a partir da revisão da tela **Atividades e datas do campus** e revisado no mesmo dia após uma análise crítica independente feita pelo Codex CLI (seção 9).

**Objetivo:** tornar a etapa 6 compreensível para quem preenche o calendário. Cada campo exibido deve pedir algo que o sistema ainda não sabe, o formulário precisa abrir perto da ação que o originou, e um mesmo dado não deve ser editável em vários lugares sem motivo. As regras de 2026 e 2027, a cobertura por par atividade/oferta/período e o contrato de gravação no Convex continuam valendo.

**Princípio de edição:** valores padrão servem para **criar** registros. Na **edição**, os valores gravados são preservados; nenhuma mudança de interface pode converter `kind`, ofertas, nome, categoria ou metadados sem uma ação explícita e visível.

**Relação com planos anteriores:** este documento complementa [regras de 2027, matrícula por oferta e referências na etapa 6](calendario-2027-ofertas-referencias-e-etapa-6.md), que definiu domínio, cobertura e o fluxo do calendário anterior. As decisões daquele plano que este documento revê estão listadas na seção 4.

## 1. Problema relatado

Ao clicar em **Preencher atividade** no cartão de uma atividade (exemplo: _Aproveitamento de estudos, certificação de conhecimentos e equivalência de estágio — ano letivo_), abre-se, dentro do cartão, um formulário genérico chamado **Novo evento local**. Esse formulário volta a pedir a atividade em **Atividade do roteiro** e mostra **Intenção do registro**, **Categoria e cor PROENS**, **Efeito na contagem** e outros campos cuja função a pessoa não consegue identificar. Os botões estão mal posicionados e há repetições.

## 2. Funcionamento atual

| Peça                                          | Papel                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activityChecklist()` / `requirements2027()`  | Catálogo de atividades: obrigatórias, opcionais, vínculos legados e escopos sem política configurada (`ActivityRequirement`). Já declara `admissionType`, `term`, `minHours`, `acceptsPriorReference` e `reviewCriterionId`. Em 2026, fundamento (`basis`) e período não estão disponíveis da mesma forma que em 2027. |
| `CalendarActivity` (`state.events`)           | Registro local. O vínculo com a atividade é opcional e feito por `requirementId`.                                                                                                                                                                                                                                      |
| `activityCoverage()`                          | Cobertura calculada por atividade × oferta (o período vem do requisito), nunca gravada.                                                                                                                                                                                                                                |
| `EventsSection.tsx`                           | Página com: botão **Adicionar novo evento**, filtros, resumo, checklist, calendário anterior, lista **Consultar registros do calendário** (registros locais e institucionais, `EventMetadataForm` e o formulário do Dia do Professor) e o formulário genérico depois dessa lista.                                      |
| `ActivityChecklist.tsx`                       | Cartões por atividade com cobertura por oferta, registros vinculados e **Preencher atividade**. O formulário aparece dentro do cartão. A etapa 3 usa o mesmo componente (`stages`).                                                                                                                                    |
| `EventEditor.tsx` + `EventEditorProvider.tsx` | Um só formulário para fluxos que se sobrepõem: atividade, evento livre, edital, etapa de avaliação, referência anterior e procedência histórica. `EventContext` tem quatro tipos (`new`, `event`, `activity`, `history`). `applyStages` monta etapas em lote por outro caminho.                                        |
| `prepare(requirementId)`                      | Na **criação**, preenche nome, `requirementId`, ofertas pertinentes, `kind: 'note'`, categoria deduzida do id e metadados do edital. A **edição** (`edit`) recupera os valores gravados.                                                                                                                               |

A separação entre **requisito**, **registro** e **cobertura calculada** está correta e deve ser preservada.

## 3. Diagnóstico

### 3.1 Campo a campo

| Campo                             | O que guarda                               | Diagnóstico                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Intenção do registro**          | `recordType`: `event` ou `prior-reference` | **UI.** Em 2027, um registro **vinculado** só pode ser referência anterior se o requisito tiver `acceptsPriorReference` (editais de transferência e o edital regular do processo seletivo) e as datas começarem antes do ano. Uma referência **sem vínculo**, com fonte textual e sem PDF, é aceita e já é testada (`editor-2027.spec.ts:26`). Portanto, o campo é necessário no evento livre e inútil na maioria das atividades. O plano anterior manteve `recordType` como intenção documental, e isso continua valendo. |
| **Atividade do roteiro**          | `requirementId`                            | **UI.** Ao abrir por **Preencher atividade**, o valor já está definido. Trocá-lo chama `changeRequirement`, que preserva os contextos `new` e `history`, mas, no contexto de atividade, leva a pessoa para a etapa 3 se ela escolher uma etapa de avaliação. Existem duas implementações para editar o vínculo: o editor compartilhado e o `EventMetadataForm`. O vínculo **precisa continuar editável**, para corrigir classificações e registros legados. "Roteiro" é um termo interno.                                  |
| **Descrição**                     | `name`                                     | Na criação, vem do nome da atividade; na edição, do registro. É impressa no calendário.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Categoria e cor PROENS**        | `category`                                 | Padrão deduzido pelo id em `prepare()`. Define a cor e também a marcação na grade impressa: `limite`, por exemplo, só marca as extremidades do intervalo (`calendar-layout.ts:145`). Não é só cosmética.                                                                                                                                                                                                                                                                                                                   |
| **Efeito na contagem**            | `kind`: `include`, `exclude` ou `note`     | **Responsabilidade distinta da categoria.** `kind` governa a contagem e `category` governa a apresentação. `eventCategory()` só usa `kind` quando falta uma categoria válida; não existe dedução no sentido inverso. Na criação, uma pergunta única pode definir os dois. `note` é o **padrão** para atividades novas, mas não é uma restrição do domínio: registros vinculados existentes podem incluir ou excluir dias. Só referência anterior, ocorrência fora do ano e edital tipado exigem `note`.                    |
| **Ofertas** (checkbox)            | `modalities`                               | O escopo é sempre necessário. Com uma única oferta, ele pode ser **exibido** sem checkbox. Com várias, é preciso diferenciar ofertas obrigatórias de ofertas permitidas ou opcionais. Em 2027, registros legados sem ofertas explícitas não contam na cobertura, e a edição hoje preenche essa ausência com todas as ofertas. **Bug:** o `<legend>` "Forma de oferta/nível deste evento" está no meio do `fieldset` abrangente, e o navegador o desenha no topo, acima de **Intenção do registro**.                        |
| **"Confirmo as datas, a fonte…"** | `confirmed` (somente no formulário)        | Não é gravado (o normalizador e os validators do Convex não o conhecem), mas **tem efeito**: bloqueia a aplicação normal e a aplicação em lote das etapas (`applyStages`). O plano anterior proíbe tratá-lo como aprovação da Proens.                                                                                                                                                                                                                                                                                      |

### 3.2 Ações e organização da página

- Nos contextos de atividade e histórico há quatro ações; nos demais, três. Duas delas, **Voltar à lista** e **Fechar preenchimento**, chamam `editor.close`. A sugestão de etapas pode acrescentar uma quinta. Há também um parágrafo explicando a diferença entre elas.
- **Adicionar novo evento**, no topo, abre o formulário depois da lista de registros.
- **Preencher atividade** vem depois da cobertura e dos registros vinculados, e o formulário aparece dentro do cartão.
- O mesmo registro aparece no cartão da atividade e em **Consultar registros do calendário**. O plano anterior admitia as duas representações, desde que não parecessem registros independentes; na prática, os dois blocos não mostram que se trata do mesmo registro.
- O cartão repete, por oferta, aplicabilidade, cobertura, conferência humana e, quando existem, execução, avisos e problemas, mesmo com uma única oferta.
- O formulário do Dia do Professor fica dentro do registro institucional correspondente, na lista geral.

### 3.3 Arquitetura

1. **Formato plano.** `EventValues` tem 21 campos, todos obrigatórios no tipo e muitos aceitando vazio. `CalendarActivity` tem campos básicos e metadados opcionais. As restrições entre campos estão em `validateActivityRecord`, nos comandos (`applyEvent`) e na normalização. Os fluxos se sobrepõem (uma referência pode ser um edital), então uma união exclusiva de cinco tipos **no domínio** não é recomendada. Uma união **no formulário**, derivada do fluxo, pode simplificar a UI; isso fica para ser comprovado na fase 4.
2. **Inferências pelo id.** `activityGroup()`, a categoria de `prepare()`, `stageRequirement()`, o número da etapa e a detecção de edital usam regex ou prefixos do id. Centralizar `group` e `defaultCategory` no requisito é útil. `variant` só pode substituir a detecção por tipo: `minHours` (40, 20) e o número da etapa continuam necessários.
3. **Etapas sem horas** é regra da UI (o campo fica oculto), não de `validateActivityRecord`. A proibição de horas na validação vale para referências anteriores e ocorrências fora do ano.

## 4. Decisões do plano anterior que este documento revê

| Plano anterior                                                                                   | Proposta                                                                                                                                                                                                                                                   | Motivo                                                                            |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 4.2: o cartão mostra quatro dimensões (aplicabilidade, cobertura, conferência humana, execução). | Manter as quatro no domínio, no detalhe expansível e na etapa 7. No cartão, mostrar uma **situação principal** calculada pela regra da seção 5.4. Expandir por oferta quando as ofertas divergirem ou houver problema.                                     | Na etapa de preenchimento, a pergunta principal é "faltam datas?".                |
| 4.3: campos comuns incluem vínculo e efeito.                                                     | Na **criação** a partir de uma atividade, vínculo vira cabeçalho, com a ação **Alterar vínculo**, e efeito fica com o padrão, visível em **Mais opções**. Na **edição**, os valores gravados ficam visíveis e editáveis.                                   | Na criação, esses valores já são conhecidos; na edição, precisam ser corrigíveis. |
| 4.1, item 5: listagem geral de registros mais cartão que resume vínculos.                        | Uma **consulta de registros** contínua, somente leitura e completa, também para PARECERISTA. Ela identifica o vínculo de cada registro e leva ao mesmo editor. O `EventMetadataForm` sai, porque o vínculo e a categoria passam para o editor do registro. | Elimina a segunda implementação de edição sem perder a consulta completa.         |
| 4.1: contadores por pares obrigação/oferta/período.                                              | **Mantidos.** O texto muda ("Técnico integrado: 12 de 30 atividades obrigatórias com planejamento completo"), mas o denominador continua sendo o par por oferta. Em calendários com várias ofertas, o resumo continua separado por oferta.                 | Contar atividades agregadas esconderia ofertas pendentes.                         |

As demais decisões continuam válidas: filtros na URL; um só formulário ativo; **Aplicar**, **Fechar** e **Cancelar e descartar** com os significados atuais; rascunho em memória preservado ao fechar e ao mudar filtros; referência anterior manual sem PDF; `recordType` como intenção declarada; regras do calendário anterior; e etapas de avaliação editadas na etapa 3.

## 5. Proposta

### 5.1 Matriz de fluxos (pré-requisito de todas as fases)

Antes de alterar a UI, fixar esta matriz em testes de navegador. Cada linha define campos editáveis, valores preservados, destino e ação de aplicação.

| Fluxo                            | Entrada                             | Mostra                                                                                             | Preserva / restrições                                                                         | Ação                                        |
| -------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Atividade nova                   | **Preencher atividade**             | Cabeçalho da atividade, datas, fonte, escopo (checkbox só com escolha real), **Mais opções**       | Padrões de `prepare()`                                                                        | Aplicar                                     |
| Atividade nova — edital          | Idem, requisito com `admissionType` | Acrescenta situação da publicação, ingresso e ajuste de prazo; intenção se `acceptsPriorReference` | Metadados de ingresso                                                                         | Aplicar                                     |
| Edição de registro vinculado     | **Editar**                          | Todos os valores gravados, inclusive `kind` se não for `note`; **Alterar vínculo**                 | Nada é substituído por padrão                                                                 | Aplicar                                     |
| Evento livre                     | **Adicionar evento**                | "O que é este evento?", nome, datas, fonte, escopo, intenção (referência anterior), tipo de edital | Referência sem PDF e edital sem vínculo continuam possíveis                                   | Aplicar                                     |
| Histórico — nova ocorrência      | **Preparar nova ocorrência**        | Como evento livre, com origem                                                                      | Datas e fonte por preencher                                                                   | Aplicar                                     |
| Histórico — referência           | **Referenciar esta ocorrência**     | Datas originais, fonte, aviso                                                                      | `recordType: prior-reference`, `kind: note`                                                   | Aplicar                                     |
| Histórico — vincular procedência | **Conferir e vincular procedência** | Registro existente só para leitura e a origem                                                      | Datas, fonte, ofertas e identidade intactas                                                   | **Aplicar vínculo ao registro existente**   |
| Etapa de avaliação               | Etapa 3                             | Datas, fonte, escopo, sugestão                                                                     | Lote, sugestão da 1ª e seguintes, remoção da automação na edição manual, recálculo por oferta | Aplicar / Aplicar todas as etapas sugeridas |

**Alterar vínculo:** abre a escolha de atividade (inclusive **Sem vínculo**) dentro do editor. Etapas de avaliação **não** aparecem como opção na etapa 6; o editor da etapa 3 oferece suas próprias opções. Isso substitui a navegação implícita de `changeRequirement` e evita que o formulário desapareça ao trocar para uma etapa (regressão coberta em `editor-regressions.spec.ts:281`).

### 5.2 Fase 0 — correções estritamente visuais

Escopo: `EventEditor.tsx`, `ActivityChecklist.tsx`, `EventsSection.tsx` e CSS. **Não altera valores, padrões, comandos nem o Convex.** Cada item mantém o valor no formulário, mesmo quando o controle é ocultado.

1. Corrigir o `<legend>`: as ofertas ficam em um `fieldset` próprio cujo primeiro filho é o `legend`.
2. Remover o botão duplicado **Fechar preenchimento** e o parágrafo explicativo. As ações continuam **Aplicar**, **Fechar** e **Cancelar e descartar**.
3. Na criação a partir de uma atividade, trocar o select **Atividade do roteiro** por um cabeçalho com o nome e, quando houver, fundamento e período (2026 pode não ter) e a ação **Alterar vínculo**, que revela o select atual. Na edição, o select continua visível.
4. Exibir **Intenção do registro** no evento livre, na edição de uma referência existente, no histórico e em requisitos com `acceptsPriorReference`. Ocultar nos demais requisitos.
5. Na criação a partir de uma atividade, mover **Descrição**, **Categoria** e **Efeito na contagem** para **Mais opções**, com os padrões atuais. Na edição, um registro cujo `kind` não seja `note` mostra o efeito fora desse grupo. Erros de validação em campos recolhidos abrem o grupo e levam o foco ao campo.
6. Com uma única oferta aplicável, mostrar o escopo como texto ("Aplica-se a: Técnico integrado") em vez de checkbox, sem alterar o valor. Com várias ofertas, manter os checkboxes e indicar quais são obrigatórias.
7. Mover **Preencher atividade** / **Adicionar outro período** para junto do título do cartão.
8. Abrir o evento livre logo abaixo do botão que o originou, conforme D1.

**Fora da fase 0:** remover ou persistir a confirmação (D2), mudar o `kind` padrão e novos metadados no requisito.

### 5.3 Fase 1 — metadados explícitos no requisito

Acrescentar a `ActivityRequirement` campos que só explicitam o comportamento atual:

| Campo             | Substitui                                                        | Observação                                           |
| ----------------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| `group`           | regex de `activityGroup()`                                       |                                                      |
| `defaultCategory` | dedução em `prepare()` (`includes('council')`, `cultural-week`…) |                                                      |
| `variant`         | detecção de etapa, edital e horas por prefixo                    | `minHours` e o número da etapa continuam como campos |

Valores de `variant`: `activity`, `hours`, `admission-notice` e `stage`. Não criar uma variante "prazo curto" sem regra que a sustente.

Critério de saída: testes de equivalência garantem que, para os catálogos de 2026, 2027 e anos sem política, `group`, a categoria preparada e os valores de `prepare()` são idênticos aos atuais. IDs persistidos e vínculos legados continuam resolvíveis. O formato gravado não muda.

### 5.4 Fase 2 — organização da página

Vem antes da composição de formulários porque é a melhoria mais perceptível e não depende dela.

```text
Atividades e datas do campus
Técnico integrado: 12 de 30 atividades obrigatórias com planejamento completo · 3 a confirmar
[Buscar] [Oferta] [Situação] [Assunto]

Atividades do calendário
  ▸ Ingresso e vida acadêmica (10)
      Aproveitamento de estudos… — ano letivo · art. 11, VI   Pendente         [Preencher atividade]
      Rematrícula — 1º semestre · art. 11, V                  Planejamento completo · 10/02 a 14/02  [Editar]
  ▸ Registros e prazos docentes
  ▸ Atividades e semanas do campus

Outros eventos do campus                                   [Adicionar evento]
  Feriado municipal — 20/01 · suspende aulas                         [Editar]

Consultar registros do calendário (todos, somente leitura)             [▸]
  inclui registros institucionais e o Dia do Professor [Ajustar data]

Calendário anterior (opcional)                                         [▸]
```

- **Situação principal por atividade:** pendente se nenhuma oferta obrigatória tiver cobertura; parcial se alguma estiver incompleta; **planejamento completo** se todas estiverem completas; opcional se nenhuma oferta for obrigatória; **aplicação a confirmar** se alguma oferta estiver como `unconfigured`. Problemas e avisos têm prioridade visual. "Completo" nunca sugere conformidade ou execução comprovada.
- **Outros eventos do campus:** registros sem `requirementId`.
- **Consulta de registros:** todos os registros, com vínculo, categoria, efeito, fonte, ofertas, finalidade de ingresso e procedência. O `EventMetadataForm` é removido. PARECERISTA consulta tudo por aqui, sem botões de edição e sem nenhuma gravação.
- **Links de revisão** (`?atividade=`): abrem o grupo **e** o item, inclusive quando a situação principal o recolheria, e posicionam o foco. O mecanismo atual, que abre só o `details` ancestral mais próximo, precisa ser revisto se houver mais níveis.

### 5.5 Fase 3 — evento livre com pergunta inicial

No evento livre, a primeira pergunta passa a ser **O que é este evento?**:

| Opção                               | `kind`    | Categoria padrão                |
| ----------------------------------- | --------- | ------------------------------- |
| Feriado ou recesso (suspende aulas) | `exclude` | `feriado` / `recesso` (escolha) |
| Dia letivo extra ou reposição       | `include` | `sabado`                        |
| Evento ou atividade do campus       | `note`    | `evento`                        |
| Prazo                               | `note`    | `prazo`                         |
| Publicação de edital                | `note`    | `prazo`, com tipo de edital     |

Atende à exigência do plano anterior de uma escolha consciente do efeito. `kind` e `category` continuam sendo campos separados no domínio e editáveis em **Mais opções**. Na edição, a pergunta é derivada dos valores gravados quando houver correspondência exata; caso contrário, aparecem os dois campos.

### 5.6 Fase 4 — composição de formulários (condicional)

Executar somente se, depois das fases 0 a 3, as condicionais do editor continuarem difíceis de manter.

- Núcleo comum e blocos por fluxo, com a composição oficial do TanStack Form (`createFormHook`/`withForm`), conferindo os exports da versão instalada, conforme o `AGENTS.md`. Manter o hook compartilhado e o contrato de rascunho.
- Duas conversões puras e testadas: **registro → formulário** (edição, legados sem ofertas) e **formulário → registro**. `applyStages` passa a usar a mesma conversão de saída.
- Trocar de fluxo não pode descartar valores sem aviso. O rascunho continua tratando atualização remota, descarte, troca de usuário e substituição do calendário. Não se promete recuperação após recarregar a página.

## 6. Testes e critérios de saída

- **Comportamento, não só ausência de controles.** Regressões a acrescentar:
  - referência livre sem PDF continua possível;
  - edição de registro vinculado com `include`/`exclude` não altera o efeito;
  - **Alterar vínculo** corrige e remove vínculo;
  - etapa manual e automática na etapa 3 (lote, sugestões, remoção da automação);
  - edital sem vínculo;
  - ofertas opcionais e registro legado sem ofertas;
  - PARECERISTA consulta tudo com zero gravações;
  - atualização remota com formulário aberto;
  - foco após aplicar quando o registro muda de bloco;
  - `legend` junto das ofertas;
  - erro em campo recolhido abre **Mais opções**.
- **Suítes afetadas:** `editor-2027`, `editor-forms`, `editor-event-drafts`, `editor-regressions`, `editor-reviewer`, `editor-session`, `history-occurrence`, `calendar-reference`, `scroll-layout` e `critical-states.visual` (`calendar-editor-event`, `event-pending-draft`). Atualizar seletores preservando as verificações de identidade, datas, contagem e gravação.
- **Seletores que mudam:** `#event-requirement` (passa a ficar atrás de **Alterar vínculo**), `#event-record-type`, `#event-kind`, `#cancel-inline-history`, `data-prepare-activity`, `data-event-metadata`, `#event-list`.
- **Mobile:** no painel em linha, recolher um grupo não pode esconder o editor ativo; teclado virtual, ações e mensagens ficam desobstruídos. Se D1 mudar para gaveta: rolagem interna, foco preso, retorno de foco e redimensionamento durante o preenchimento.
- **Critério de saída de cada fase:** dados produzidos equivalentes aos atuais nos fluxos da matriz; suítes direcionadas aprovadas; comparação visual desktop e mobile com referências atualizadas só para mudanças intencionais, conforme [Verificação](../verificacao.md); `pnpm check`. `pnpm test:runtime:linux` só é dispensado se o gerador de PDF, o modelo de impressão e as dependências do runtime não mudarem.

## 7. Decisões

- **D1 — Onde o formulário abre.** Recomendado: **painel em linha** logo abaixo do título do cartão ou do botão de origem, com o restante do cartão recolhido enquanto ele estiver aberto. Vale para atividade, evento livre e histórico. Mantém a decisão do plano anterior e permite avaliar quanto do problema era volume e hierarquia. Reavaliar a gaveta lateral só se o uso real continuar mostrando dificuldade.
- **D2 — Checkbox de confirmação.** Recomendado: **remover o checkbox genérico** em uma fase própria, ajustando o provider (`apply` e `applyStages`) e substituindo-o por ações com rótulo explícito (por exemplo, **Aplicar vínculo ao registro existente**, **Aplicar todas as etapas sugeridas**). Motivo: redundância com uma ação clara, não a ausência de persistência. Persistir um atestado (quem e quando) é outro requisito de produto e fica fora deste plano.
- **D3 — Descrição em atividades.** Recomendado: **manter editável** em **Mais opções**. O nome do requisito é padrão só na criação; na edição, preserva-se o nome gravado, que continua aparecendo no resumo do registro.

## 8. Ordem de execução

1. Matriz de fluxos (5.1) fixada em testes do comportamento atual.
2. Fase 0 — correções visuais.
3. Fase 1 — metadados explícitos com testes de equivalência.
4. Fase 2 — organização da página e consulta de registros.
5. Fase 3 — pergunta inicial do evento livre.
6. D2 — remoção da confirmação genérica.
7. Fase 4 — composição de formulários, se ainda for necessária.

## 9. Revisão crítica independente

Em 27/10/2026, o Codex CLI (`codex exec -s read-only`) analisou a primeira versão deste plano contra o código e o plano anterior, sem alterar arquivos nem executar suítes. As afirmações principais foram conferidas no código antes de serem incorporadas.

Correções factuais incorporadas:

- Referência anterior é aceita sem vínculo e para o edital regular, não só para editais de transferência.
- `kind` e `category` têm responsabilidades distintas; `eventCategory()` não deduz efeito pela categoria.
- `note` é padrão de criação, não restrição para atividades vinculadas.
- A confirmação não é gravada, mas bloqueia `apply` e `applyStages`.
- `EventValues` tem 21 campos; "etapa sem horas" é regra de UI.
- A categoria afeta a marcação impressa.

Mudanças de proposta decorrentes da revisão:

- Matriz de fluxos como pré-requisito.
- Princípio de preservação na edição.
- Ação **Alterar vínculo**.
- Referência manual sem PDF mantida.
- Fase 0 restrita ao visual.
- Contadores por par mantidos.
- Consulta completa de registros preservada para PARECERISTA.
- Rótulos **Aplicar/Fechar** mantidos.
- Organização da página antes da composição de formulários, que se torna condicional.
- Recomendações para D1 a D3.
- Inventário de suítes ampliado.

## 10. Registro da implementação — 27/10/2026

Implementação aprovada pelo usuário para todas as fases, com revisões do Codex CLI nos pontos relevantes.

### Matriz de fluxos

`test/browser/editor-activity-flows.spec.ts` fixou primeiro, contra o código anterior, o resultado gravado de três fluxos ainda sem cobertura: atividade nova, edição de registro vinculado com `exclude` e edital livre sem vínculo (3/3 aprovados antes das mudanças). Os demais fluxos da matriz já tinham testes: referência sem PDF (`editor-2027`), histórico (`editor-event-drafts`, `history-occurrence`), etapas (`editor-forms`) e parecerista (`editor-reviewer`).

### Fase 0

- Cabeçalho **Vinculado a esta atividade**, com o fundamento, e **Alterar vínculo**, que revela o select e leva o foco a ele. Etapas de avaliação só aparecem como opção quando o registro já é uma etapa.
- **Intenção do registro** é exibida no evento livre, no histórico, em referências existentes e em requisitos com `acceptsPriorReference`.
- Ofertas em `fieldset` próprio com `legend`. Quando só há uma oferta válida para o registro, ela aparece como texto. Etapas consideram apenas a oferta da etapa, e ofertas já gravadas fora desse conjunto continuam visíveis para correção.
- Descrição, categoria e efeito ficam em **Mais opções** ao criar a partir de uma atividade. Campos inválidos recolhidos abrem o grupo (`onInvalidCapture`).
- Ações reduzidas a **Aplicar…**, **Fechar** e **Cancelar e descartar**.

### Fase 1

`src/activity-metadata.ts` concentra `group`, `defaultCategory` e `variant`, preenchidos pelos catálogos de 2026, 2027 e de anos sem política. O preparo de um registro virou a função pura `activityDraft`. `test/activity-metadata.test.ts` compara metadados e preparo com as regras anteriores em 27 configurações.

A comparação revelou um defeito anterior: em 2026, num calendário com várias ofertas, a etapa de uma oferta era preparada com todas, e `applyEvent` recusava a aplicação. O preparo agora limita as ofertas às válidas para o requisito, com regressão própria.

### Fase 2

- **Atividades do calendário**: resumo por oferta, com o mesmo denominador por par, e cartões com situação principal (`src/activity-status.ts`). O detalhe **Situação por oferta e conferência** abre sozinho quando as ofertas divergem ou há problema.
- **Outros eventos do campus** (`#event-list`): registros sem vínculo resolvível mais o Dia do Professor. O editor abre sob o botão **Adicionar novo evento** ou sob o item editado. O Dia do Professor ficou neste bloco, e não na consulta, porque é uma ação do campus.
- **Consultar todos os registros do calendário**: lista somente leitura com vínculo, efeito, fonte e ofertas, aberta por padrão para PARECERISTA. O `EventMetadataForm` foi removido.
- Princípio de preservação: `eventFromValues` parte do registro gravado na edição, mantém campos que o formulário não exibe e a ausência de `recordType`, e encerra a distribuição automática de etapas, como antes.
- **Carga horária** aparece em atividades de horas, em eventos livres e em registros que já têm horas.

### Fase 3 e D2

- O evento livre pergunta **O que é este evento?** com seis respostas. Feriado e recesso viraram opções separadas, em vez de uma escolha interna. A resposta define `kind` e `category`. Registros com combinação livre mostram os dois campos. `eventType` é um campo só da interface, derivado na edição.
- A confirmação genérica foi removida de `apply` e `applyStages`; a fonte continua obrigatória. O vínculo de procedência usa o botão **Aplicar vínculo ao registro existente**.

### Fase 4

Não foi adotado `createFormHook`. As duas conversões puras previstas (`activityDraft`/`eventValues` na entrada e `eventFromValues` na saída) foram implementadas. `applyStages` mantém sua construção própria, porque cria etapas com distribuição automática. O editor ficou com condições nomeadas (`activityCreation`, `askType`, `showLink`, `showRecordType`, `showHours`), sem necessidade de mexer em `useDraftForm`.

### Desvios do texto do plano

- A situação **aplicação a confirmar** é principal apenas quando não há oferta obrigatória. Ao lado de ofertas obrigatórias, aparece como marcador secundário.
- O `#event-list` passou a designar **Outros eventos do campus**; a consulta completa usa `#calendar-record-list`.
- Os textos de aplicação (**Adicionar evento** e **Aplicar alterações do evento**) foram mantidos.

### Revisões do Codex

- Fases 0–1: quatro achados, todos corrigidos com testes:
  - foco em **Alterar vínculo**;
  - ofertas válidas e marcador de obrigatoriedade em 2026;
  - equivalência do preparo;
  - teste raso de troca de vínculo.
- Implementação completa: seis achados, todos corrigidos com testes:
  - categoria ausente em registro legado preservada ao mudar só o vínculo;
  - ajuste de prazo conferido preservado quando data e fonte não mudam;
  - **Aplicar vínculo ao registro existente** grava somente `historicalSource`, com os campos desabilitados para consulta;
  - metadados de edital só são gravados enquanto o tipo é edital, e o rascunho os conserva;
  - links `?atividade=` abrem o detalhe da atividade;
  - `radio` no histórico excluído da regra de largura de campos textuais, com teste de geometria confirmado em falha antes da correção.

### Validação

- Linha de base antes das mudanças: 76/76 execuções nas suítes de navegador afetadas.
- Referências visuais atualizadas somente para `calendar-editor-event` e `event-pending-draft`, desktop e mobile, após inspeção. A comparação sem atualização foi aprovada (22/22).
- Capturas temporárias dos cartões e do formulário de atividade em 1440 px e 390 px também foram inspecionadas. Elas revelaram e levaram à correção da largura dos `radio`, da grade do formulário em **Outros eventos** e da repetição do nome da atividade.
- Uma primeira execução de `pnpm check` falhou em `router-navigation.spec.ts` ("a delayed campus creation…"), fora da etapa 6. A falha ocorreu enquanto o Codex rodava em paralelo; o teste passou 3/3 isolado.
- `pnpm check` final, sem execução paralela: aprovado, com 75 arquivos e 429 testes Vitest, 160 testes de navegador, lint, tipos e build.
- `pnpm test:runtime:linux` não foi executado: gerador de PDF, modelo de impressão e dependências do runtime não mudaram.
