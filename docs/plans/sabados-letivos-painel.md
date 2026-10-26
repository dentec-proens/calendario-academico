# Plano: Sábados letivos com calendário anual e painel de seleção

> **Para agentes:** use superpowers:subagent-driven-development ou superpowers:executing-plans para executar tarefa por tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** substituir a etapa 4 do editor (grade de checkboxes + uma ficha por data abaixo da tabela) por um calendário anual com um painel ao lado. O painel aplica uma atividade e uma fonte a todos os sábados selecionados, permite editar e remover sábados registrados e mostra a contagem de dias letivos.

**Arquitetura:** um seletor puro em `src/saturdays.ts` classifica cada dia do ano: disponível, registrado ou fora dos períodos, com os impedimentos. Um comando puro novo edita um sábado registrado. A interface vai para `web/features/calendar-editor/saturdays/`, no mesmo padrão de `events/` e `history/`. `SaturdaysForm` mantém o TanStack Form da seleção. Grade, contagem e painel são componentes de apresentação. A edição de um registrado é um formulário próprio. Quando o contêiner é estreito, o painel vira um `<dialog>` aberto por uma barra fixa.

**Tecnologias:** React 19.3, `@tanstack/react-form` 1.33.5 via `useCalendarForm`/`useDraftForm`, Vitest, Playwright.

**Especificação:** proposta A do canvas [Sábados letivos — propostas](https://claude.ai/artifact/Kar5nJY9jXAtLMrWKk9Xev): telas "A · Calendário anual + painel de seleção (desktop)" e "A · Mobile".

## Pré-requisito

O working tree tem a versão "uma ficha por data" sem commit em `SaturdaysForm.tsx`, `saturday-form.css`, `DaysSection.tsx`, `src/saturdays.ts`, `commands.ts` e nos testes, junto com cerca de 60 outros arquivos. Faça o commit desse trabalho antes da Tarefa 1, ou descarte só a parte de sábados, para que este plano parta de um estado limpo. O plano substitui por inteiro o formulário por data. `applySaturdayActivities` continua sendo o comando de inclusão.

## Restrições globais

- Textos da interface e mensagens de commit em português. Commits com resumo na primeira linha e corpo com contexto, alterações e validação.
- Antes de cada commit, rode `pnpm check`. Toda mudança de UI exige também `pnpm test:linux`: desktop e mobile, teclado, foco e controles desobstruídos.
- Antes de usar uma API do `@tanstack/react-form`, confira os tipos instalados e a [composição oficial](https://tanstack.com/form/latest/docs/framework/react/guides/form-composition). Use apenas `useCalendarForm`, sem `useForm` direto.
- Gravação concluída é só a confirmação do Convex. A interface aplica comandos puros por `session.apply`/`applyCommand`. Renderizar não altera estado.
- Cor de sábado registrado: `#c3e184`, a mesma de `src/categories.ts`. Os demais estados usam os tokens de `web/components/ui/tokens.css`: `--ui-action`, `--ui-warning`, `--ui-warning-soft`, `--ui-border` e `--ui-muted`.
- Semana começa no domingo (D S T Q Q S SÁB). A coluna de sábado tem o rótulo "SÁB" destacado.
- Sábados fora dos períodos letivos não são selecionáveis. A validação de domínio em `saturdayEvents` continua como última defesa.
- Nada de scripts ou comandos só de Unix. Atualize as referências visuais conforme o README: darwin e Linux via Docker.

## Decisões fixadas

- **Seleção em lote:** o formulário volta ao formato `{ dates: string[]; name: string; evidence: string }`, o mesmo da versão commitada. Para dar valores diferentes a datas diferentes, faça lotes separados ou edite depois.
- **Esvaziar a seleção** (desmarcar a última data ou clicar em "Limpar") volta `name` e `evidence` para `''`. Assim o indicador de alterações não aplicadas some, como hoje.
- **Pré-preenchimento:** quando a seleção passa de 0 para 1 e `evidence` está vazio, ela recebe a fonte do último evento `category: 'sabado'` em `state.events`. As sugestões de atividade são os nomes distintos dos eventos `sabado`, sem repetir o valor atual.
- **Foco:** marcar um sábado deixa o foco na própria checkbox. O painel fica `position: sticky` no desktop, então os campos continuam visíveis. Esta é a correção central.
- **Registrado editável** é o evento `category === 'sabado'` com `start === end`. Uma inclusão de vários dias, criada em "Atividades e datas do campus", aparece como registrada, mas o painel só mostra o nome e indica aquela etapa.
- **Remover** usa `confirmAction` com `intent: 'danger'` e depois `removeEvent`.
- **Contagem:** usa `evaluation` de `useCalendarEditor()`, com a verificação `scope === 'annual'` de cada oferta. O ganho previsto é o número de sábados selecionados disponíveis e sem impedimento. É uma prévia, não um recálculo completo.
- **Modo compacto:** a largura do formulário vem de `ResizeObserver`, não de media query, porque a barra lateral do editor ocupa espaço até 851 px. Abaixo de 760 px, o painel vai para um `<dialog>` modal, sem folha inferior permanente. A troca evita que a folha encubra a grade.
- A edição de um registrado é estado local (`useState`), no mesmo padrão de `EventEditorProvider`. Não entra na URL.

## Contrato de DOM usado pelos testes

| Elemento            | Seletor                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Formulário / grade  | `#saturday-form`, `fieldset#saturday-dates` (legenda "Sábados de {ano}")                                                                        |
| Cada sábado         | `[data-saturday="AAAA-MM-DD"][data-status="available\|registered\|outside"]`                                                                    |
| Disponível          | `input[type=checkbox][name=dates][value=data]` dentro de `label`                                                                                |
| Registrado editável | `button[data-edit-saturday={eventId}]`                                                                                                          |
| Fora do período     | `span` com texto acessível "fora dos períodos letivos"                                                                                          |
| Painel              | `#saturday-panel` (`aside` ou `dialog`), `#saturday-summary` (`role=status`)                                                                    |
| Seleção             | `#saturday-name`, `#saturday-evidence`, `#saturday-submit` ("Adicionar N sábado(s)"), `#saturday-clear`, `#saturday-impediments`                |
| Edição              | `#saturday-edit-form`, `#saturday-edit-name`, `#saturday-edit-evidence`, `#saturday-edit-save`, `#saturday-edit-remove`, `#saturday-edit-close` |
| Contagem            | `#saturday-day-count`                                                                                                                           |
| Compacto            | `#saturday-compact-bar`, `#saturday-open-panel`                                                                                                 |

## Pontos de atenção na revisão

1. **Inclusão de vários dias sobre um sábado** (feita em Atividades e datas): deve aparecer como registrada e não editável. O painel não pode chamar `updateSaturdayActivity` para ela. Teste na Tarefa 1 (seletor) e na Tarefa 3 (sem `data-edit-saturday`).
2. **Sábado registrado que ficou fora do período** depois de alguém ajustar os períodos: continua `registered`, para poder ser removido. Não pode virar `outside` e ficar inalcançável. Teste na Tarefa 1.
3. **Barra compacta cobrindo uma checkbox focada por teclado** no fim da página (dezembro, 390 × 844): a checkbox focada tem que estar desobstruída. Teste na Tarefa 5.
4. **Feriado selecionado:** pode ser incluído, mostra `#saturday-impediments` e não entra no ganho previsto. Teste na Tarefa 1 (`saturdayGain`) e na Tarefa 2 (aviso visível).
5. **Modo somente leitura** (`readOnly`): grade, painel e botões de edição desabilitados, e um registrado ainda pode ser aberto para leitura. Teste na Tarefa 3.

---

### Tarefa 1: Seletor do ano e comando de edição

**Arquivos:**

- Modificar: `src/saturdays.ts`
- Modificar: `src/calendar-edits/commands.ts` (após `applySaturdayActivities`)
- Teste: `test/saturdays.test.ts`

**Interfaces:**

- Produz, em `src/saturdays.ts`:
  ```ts
  export interface YearDay {
    date: string;
    day: number;
    weekday: number;
    inPeriod: boolean;
    impediments: string[];
  }
  export type SaturdayStatus = 'available' | 'registered' | 'outside';
  export interface YearSaturday extends YearDay {
    status: SaturdayStatus;
    registration?: CalendarActivity;
    editable: boolean;
  }
  export interface YearMonth {
    month: number;
    name: string;
    leadingBlanks: number;
    days: Array<YearDay | YearSaturday>;
    registered: number;
  }
  export function saturdayYear(
    state: Pick<ActivityState, 'year' | 'periods' | 'events'>,
    events: Pick<CalendarActivity, 'kind' | 'start' | 'end' | 'name'>[],
  ): YearMonth[];
  export function isYearSaturday(day: YearDay | YearSaturday): day is YearSaturday;
  export function saturdayGain(months: YearMonth[], dates: string[]): number;
  ```
  `events` são os eventos do editor, incluindo os institucionais: `impediments` reúne os nomes das exclusões que cobrem a data. `registration` é a inclusão de `state.events` que cobre a data. Precedência do status: `registered` > `outside` > `available`. `name` é o nome do mês em português com inicial maiúscula; a lista sai de `SaturdaysForm`. `leadingBlanks` é o dia da semana do dia 1, com domingo = 0.
- Produz, em `commands.ts`:

  ```ts
  export function updateSaturdayActivity<S extends ActivityState>(
    state: S,
    values: { id: string; name: string; evidence: string },
    institutional: CalendarActivity[],
  ): S;
  ```

  Recorta espaços, substitui o evento e chama `recalculateCalendar`. Erros:
  - id inexistente: `'O sábado não existe mais. Reabra o calendário.'`
  - evento que não é sábado editável: `'Este registro é editado em Atividades e datas do campus.'`
  - campo vazio: `'Informe a atividade e a fonte da decisão.'`

- [ ] **Passo 1: testes que falham.** Use um estado com período `2027-03-01`–`2027-03-31` e estes eventos:
  - sábado `s1`, de 06/03 a 06/03, nome "Feira de ciências", fonte "Ata 1"
  - inclusão "Semana acadêmica", de 22/03 a 27/03, categoria `institucional`
  - sábado `s2` em 05/06, fora do período
  - exclusão "Feriado municipal" em 20/03, passada em `events`

  ```ts
  test('saturday year classifies each Saturday and keeps registered dates reachable', () => {
    const months = saturdayYear(state, [...state.events, holiday]);
    const march = months[2]!;
    const sat = (date: string) =>
      months.flatMap((m) => m.days).find((d) => d.date === date) as YearSaturday;
    assert.equal(months.length, 12);
    assert.equal(march.name, 'Março');
    assert.equal(march.leadingBlanks, 1);
    assert.equal(march.registered, 2);
    assert.deepEqual([sat('2027-03-06').status, sat('2027-03-06').editable], ['registered', true]);
    assert.deepEqual([sat('2027-03-13').status, sat('2027-03-13').impediments], ['available', []]);
    assert.deepEqual(sat('2027-03-20').impediments, ['Feriado municipal']);
    assert.deepEqual([sat('2027-03-27').status, sat('2027-03-27').editable], ['registered', false]);
    assert.equal(sat('2027-04-03').status, 'outside');
    assert.deepEqual([sat('2027-06-05').status, sat('2027-06-05').editable], ['registered', true]);
    assert.equal(saturdayGain(months, ['2027-03-13', '2027-03-20', '2027-04-03', '2027-03-06']), 1);
  });

  test('updating a Saturday activity trims values and rejects other records', () => {
    const next = updateSaturdayActivity(
      state,
      { id: 's1', name: '  Reposição ', evidence: ' Res. 12 ' },
      [],
    );
    assert.deepEqual(pick(next.events.find((e) => e.id === 's1')), {
      name: 'Reposição',
      evidence: 'Res. 12',
    });
    assert.throws(
      () => updateSaturdayActivity(state, { id: 'x', name: 'a', evidence: 'b' }, []),
      /não existe mais/,
    );
    assert.throws(
      () => updateSaturdayActivity(state, { id: 'semana', name: 'a', evidence: 'b' }, []),
      /Atividades e datas do campus/,
    );
    assert.throws(
      () => updateSaturdayActivity(state, { id: 's1', name: ' ', evidence: 'b' }, []),
      /atividade e a fonte/,
    );
  });
  ```

- [ ] **Passo 2:** `pnpm test:unit -- test/saturdays.test.ts`. Esperado: FAIL, exports inexistentes.
- [ ] **Passo 3:** implemente os exports acima. Reaproveite `monthSaturdays`, `datesBetween` e `parseDate`.
- [ ] **Passo 4:** o mesmo comando. Esperado: PASS.
- [ ] **Passo 5:** `pnpm check` e commit: "Classifica os sábados do ano e permite editar um sábado registrado".

### Tarefa 2: Calendário anual e painel de seleção em lote

**Arquivos:**

- Criar: `web/features/calendar-editor/saturdays/SaturdaysForm.tsx` (orquestra o formulário, o estado de edição e o layout)
- Criar: `web/features/calendar-editor/saturdays/SaturdayYearGrid.tsx` (apresentação)
- Criar: `web/features/calendar-editor/saturdays/saturdays.css`
- Remover: `web/features/calendar-editor/forms/SaturdaysForm.tsx`, `web/features/calendar-editor/forms/saturday-form.css`
- Modificar: `web/features/calendar-editor/sections/DaysSection.tsx` (import e texto de ajuda: "Selecione sábados no calendário e informe a atividade e a fonte no painel; clique em um sábado registrado para editá-lo.")
- Modificar: `test/browser/editor-navigation.ts` (passa a exportar `addPeriod` e `savedState`, movidos de `editor-forms.spec.ts`)
- Teste: `test/browser/editor-forms.spec.ts`, `test/browser/editor-regressions.spec.ts`

**Interfaces:**

- Consome: `saturdayYear`, `isYearSaturday`, `saturdayGain` (Tarefa 1) e `applySaturdayActivities` (já existe).
- Produz:

  ```ts
  export default function SaturdayYearGrid(props: {
    months: YearMonth[];
    year: number;
    selected: string[];
    editingId: string | null;
    disabled: boolean;
    onToggle(date: string, checked: boolean): void;
    onBlur(): void;
    onEdit(eventId: string): void;
  }): JSX.Element;
  ```

  `SaturdaysForm` usa `useCalendarForm('saturdays', { dates: [] as string[], name: '', evidence: '' }, apply)`. `apply` chama `applySaturdayActivities` com `dates.map((date) => ({ date, name, evidence }))` e retorna os valores padrão. A grade usa `grid-template-columns: repeat(auto-fill, minmax(196px, 1fr))`. O painel é um `aside#saturday-panel` com `position: sticky`. Nesta tarefa ele tem três estados: seleção, vazio (lista agrupada por fonte, com botões `data-edit-saturday`) e, como placeholder até a Tarefa 3, edição.

- [ ] **Passo 1: reescreva os dois testes de sábado em `editor-forms.spec.ts`.**
  ```ts
  test('Saturday panel applies one activity and source to the selected dates without moving focus', async ({
    page,
    cleanup,
  }) => {
    await openEditor(page, cleanup);
    await addPeriod(page, '2027-03-01', '2027-04-30');
    await page.locator('[data-view="days"]').click();
    await expect(page.locator('[data-saturday]')).toHaveCount(52);
    const first = page.locator('#saturday-dates input[value="2027-03-06"]');
    await first.check();
    await expect(first).toBeFocused();
    await expect(page.locator('#saturday-name')).toBeInViewport();
    await page.locator('#saturday-dates input[value="2027-04-03"]').check();
    await expect(page.locator('#saturday-summary')).toContainText('2 sábados selecionados');
    await page.locator('#saturday-name').fill('Reposição de aulas');
    await page.locator('#saturday-evidence').fill('Resolução nº 12/2026');
    await expect(page.locator('#saturday-submit')).toHaveText('Adicionar 2 sábados');
    await page.locator('#saturday-submit').click();
    // poll: sábados em state.events com início ['2027-03-06', '2027-04-03'], todos com o mesmo nome e fonte
    await expect(page.locator('[data-saturday="2027-03-06"]')).toHaveAttribute(
      'data-status',
      'registered',
    );
    await expect(page.locator('#saturday-name')).toHaveCount(0);
  });

  test('Saturdays outside teaching periods are shown but not selectable', async ({
    page,
    cleanup,
  }) => {
    await openEditor(page, cleanup);
    await addPeriod(page, '2027-03-01', '2027-03-31');
    await page.locator('[data-view="days"]').click();
    const outside = page.locator('[data-saturday="2027-04-03"]');
    await expect(outside).toHaveAttribute('data-status', 'outside');
    await expect(outside.locator('input')).toHaveCount(0);
    await expect(outside).toContainText('fora dos períodos letivos');
  });

  test('a selected holiday warns that it will not count as a teaching day', async ({
    page,
    cleanup,
  }) => {
    // período 2027-04-01..2027-05-31. A fixture não tem feriado em sábado: crie em Atividades e datas uma exclusão
    // "Dia do Trabalho" em 2027-05-01, pelo mesmo fluxo de criação de evento de editor-event-drafts.spec.ts.
    await page.locator('#saturday-dates input[value="2027-05-01"]').check();
    await expect(page.locator('#saturday-impediments')).toContainText('01/05');
    await expect(page.locator('#saturday-impediments')).toContainText('Dia do Trabalho');
  });
  ```
- [ ] **Passo 2:** em `editor-regressions.spec.ts`, adapte o teste "…annual Saturday selections survive navigation". Chame `addPeriod(page, '2027-03-01', '2027-04-30')` antes de abrir a etapa e use `#saturday-name`/`#saturday-evidence`. As expectativas continuam: valores preservados ao navegar e, depois de desmarcar as duas datas, `#unapplied-status` oculto e `calls.saves` igual ao valor lido com `savedState` logo depois do `addPeriod`. Ou seja, a seleção não gerou gravação.
- [ ] **Passo 3:** `pnpm test:browser:functional -- editor-forms editor-regressions`. Esperado: FAIL nos seletores novos.
- [ ] **Passo 4:** implemente os arquivos acima conforme as decisões fixadas: pré-preenchimento, esvaziamento, sugestões e foco. Cada sábado `available` é um `label` contendo a checkbox, com `aria-label` no mesmo formato de hoje. Dias que não são sábado são `span` com `aria-hidden="true"`; os feriados de dias úteis aparecem com sublinhado pontilhado e `title`.
- [ ] **Passo 5:** o mesmo comando. Esperado: PASS.
- [ ] **Passo 6:** `pnpm check` e commit: "Substitui a grade de sábados por calendário anual com painel de seleção em lote".

### Tarefa 3: Editar e remover um sábado registrado no painel

**Arquivos:**

- Criar: `web/features/calendar-editor/saturdays/SaturdayEditForm.tsx`
- Modificar: `web/features/calendar-editor/saturdays/SaturdaysForm.tsx`
- Teste: `test/browser/editor-forms.spec.ts`

**Interfaces:**

- Consome: `updateSaturdayActivity` (Tarefa 1), `removeEvent`, `confirmAction` de `web/components/confirmation.ts`.
- Produz:

  ```ts
  export default function SaturdayEditForm(props: {
    event: CalendarActivity;
    onClose(focusDate: string): void;
  }): JSX.Element;
  ```

  Use `useCalendarForm(\`saturday-edit:${event.id}\`, { name: event.name, evidence: event.evidence }, apply)`, montado com `key={event.id}`. Mostra também "Mesma fonte também usada em dd/mm, …". Para um registrado não editável, `SaturdaysForm` mostra só o nome e a frase "Edite este registro em Atividades e datas do campus." Ao salvar, remover ou fechar, o foco volta para a célula da data: o botão do registrado ou, depois de remover, a checkbox que reaparece.

- [ ] **Passo 1: testes que falham.**
  ```ts
  test('a registered Saturday is edited and removed from the panel', async ({ page, cleanup }) => {
    // adicione 2027-03-06 pelo painel (fluxo da Tarefa 2)
    await page.locator('[data-saturday="2027-03-06"] [data-edit-saturday]').click();
    await page.locator('#saturday-edit-name').fill('Feira de ciências');
    await page.locator('#saturday-edit-save').click();
    // poll: o evento sabado de 2027-03-06 tem name 'Feira de ciências'
    await expect(page.locator('[data-saturday="2027-03-06"] [data-edit-saturday]')).toBeFocused();
    await page.locator('[data-saturday="2027-03-06"] [data-edit-saturday]').click();
    await page.locator('#saturday-edit-remove').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remover sábado' }).click();
    // poll: nenhum evento sabado
    await expect(page.locator('#saturday-dates input[value="2027-03-06"]')).toBeFocused();
  });

  test('multi-day inclusions over a Saturday are shown as registered but not editable here', async () => {
    // crie em Atividades e datas uma inclusão de 2027-03-22 a 2027-03-27
    // espere data-status="registered" em 2027-03-27 e nenhum [data-edit-saturday] dentro dele
  });

  test('read-only calendars disable selection and editing of Saturdays', async () => {
    // use o mecanismo de somente leitura que editor-reviewer.spec.ts já usa
    // espere checkboxes e #saturday-edit-save desabilitados
  });
  ```
- [ ] **Passo 2:** `pnpm test:browser:functional -- editor-forms`. Esperado: FAIL.
- [ ] **Passo 3:** implemente. `confirmAction({ title: 'Remover sábado letivo', description: 'O sábado dd/mm/aaaa deixa de contar como dia letivo.', intent: 'danger', confirmLabel: 'Remover sábado' })`.
- [ ] **Passo 4:** o mesmo comando. Esperado: PASS.
- [ ] **Passo 5:** `pnpm check` e commit: "Permite editar e remover sábados registrados no painel da etapa".

### Tarefa 4: Contagem de dias letivos no painel

**Arquivos:**

- Criar: `web/features/calendar-editor/saturdays/SaturdayDayCount.tsx`
- Modificar: `SaturdaysForm.tsx` (renderiza no topo do painel)
- Teste: `test/browser/editor-forms.spec.ts`

**Interfaces:**

- Consome: `evaluation` do contexto, `modalityLabels` de `src/modalities.ts`, `saturdayGain`.
- Produz:

  ```ts
  export default function SaturdayDayCount(props: {
    evaluation: ReturnType<typeof evaluateCalendar> | null;
    gain: number;
  }): JSX.Element;
  ```

  Para cada oferta, mostre "{observed} de {expected} dias letivos" e, quando `gain > 0`, "· com a seleção: {observed + gain}". Com `expected === null`, mostre "{observed} dias letivos". O prefixo `modalityLabels[m]` só aparece quando há mais de uma oferta. Com `evaluation === null`, mostre "A contagem aparece depois de confirmar a semana letiva e cadastrar os períodos." A barra visual tem `aria-hidden`; o texto é a informação acessível.

- [ ] **Passo 1: teste que falha.** Depois do `addPeriod('2027-03-01', '2027-04-30')`, leia o total atual com `page.evaluate`, que reproduz o mesmo `observed` exibido pela etapa de revisão (`#total`). Espere que `#saturday-day-count` contenha `${total} de 200 dias letivos`. Depois de marcar 03-06, espere `com a seleção: ${total + 1}`.
- [ ] **Passo 2:** rode e espere FAIL.
- [ ] **Passo 3:** implemente.
- [ ] **Passo 4:** rode e espere PASS.
- [ ] **Passo 5:** `pnpm check` e commit: "Mostra a contagem de dias letivos e a prévia da seleção na etapa de sábados".

### Tarefa 5: Modo compacto, referências visuais e documentação

**Arquivos:**

- Criar: `web/features/calendar-editor/saturdays/useNarrowContainer.ts`, com `export function useNarrowContainer(ref: RefObject<HTMLElement | null>, threshold: number): boolean` (ResizeObserver; `false` antes da primeira medição)
- Criar: `web/features/calendar-editor/saturdays/SaturdayPanel.tsx`, com `export default function SaturdayPanel(props: { compact: boolean; open: boolean; label: string; onOpen(): void; onClose(): void; children: ReactNode }): JSX.Element`. Fora do modo compacto, renderiza `aside#saturday-panel`. No modo compacto, renderiza `#saturday-compact-bar` (resumo + `#saturday-open-panel` "Preencher atividade") e `dialog#saturday-panel` com `showModal`, Esc e devolução de foco, no mesmo padrão de `ConfirmationDialog`. A barra só aparece com seleção ou edição ativa.
- Modificar: `SaturdaysForm.tsx` (limite de 760 px; clicar num registrado abre o diálogo), `saturdays.css` (barra `position: sticky; bottom: 0`; `#saturday-dates input, [data-edit-saturday] { scroll-margin-bottom: 96px }`)
- Modificar: `test/browser/critical-states.visual.spec.ts` (o teste de sábados)
- Modificar: `docs/uso.md:35` (parágrafo de Sábados letivos)
- Referências: `calendar-saturdays.png` em chromium-desktop/chromium-mobile, darwin e linux

- [ ] **Passo 1: teste funcional compacto que falha** em `editor-forms.spec.ts`.
  ```ts
  test('compact Saturday panel opens as a dialog and keeps focused dates unobstructed', async ({
    page,
    cleanup,
  }) => {
    // viewport 390×844, addPeriod 2027-03-01..2027-12-17, etapa days
    await page.locator('#saturday-dates input[value="2027-03-06"]').check();
    await expect(page.locator('#saturday-compact-bar')).toContainText('1 sábado selecionado');
    await page.locator('#saturday-dates input[value="2027-12-11"]').focus();
    // elementFromPoint no centro da checkbox focada devolve a checkbox ou o label dela, não a barra
    await page.locator('#saturday-open-panel').click();
    await expect(page.locator('dialog#saturday-panel')).toHaveJSProperty('open', true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#saturday-open-panel')).toBeFocused();
    await page.locator('#saturday-open-panel').click();
    // preenche #saturday-name/#saturday-evidence, envia; o diálogo fecha e 2027-03-06 fica 'registered'
  });
  ```
- [ ] **Passo 2:** reescreva o teste visual "annual Saturdays keep activity and decision fields readable per date" como "annual Saturdays keep the selection panel next to the year grid". Ele adiciona um período pelo helper compartilhado, marca 2027-03-06 e 2027-04-03 e, se `testInfo.project.name === 'chromium-mobile'`, clica em `#saturday-open-panel`. Depois preenche os campos, mantém a verificação de `elementFromPoint` aplicada a `#saturday-name`, chama `assertNoOverflow` e tira o screenshot `calendar-saturdays.png`.
- [ ] **Passo 3:** rode `pnpm test:browser:functional -- editor-forms` e espere FAIL.
- [ ] **Passo 4:** implemente `useNarrowContainer`, `SaturdayPanel` e a integração.
- [ ] **Passo 5:** rode o mesmo comando e espere PASS. Rode `pnpm test:visual` e espere apenas `calendar-saturdays.png` alterado.
- [ ] **Passo 6:** `pnpm test:visual:update`. Inspecione as duas imagens, desktop e mobile, contra os mockups. `pnpm test:visual:linux:update` (Docker) e inspecione as imagens Linux, que ainda não existem para este teste. Rode `pnpm test:visual` de novo sem atualizar.
- [ ] **Passo 7:** atualize `docs/uso.md:35`: calendário anual, painel com uma atividade e uma fonte por lote, pré-preenchimento da fonte, edição e remoção de registrados na própria etapa, contagem de dias letivos e sábados fora dos períodos não selecionáveis. Mantenha a frase "sábados não são incluídos automaticamente para completar metas".
- [ ] **Passo 8:** `pnpm check` e `pnpm test:linux`. Registre que a validação em Windows fica para o CI. Commit: "Adapta o painel de sábados a telas estreitas e atualiza referências visuais e guia de uso".
