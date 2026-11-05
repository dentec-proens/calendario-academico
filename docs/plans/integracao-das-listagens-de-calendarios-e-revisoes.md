# Integração das listagens de calendários e de revisões

## Princípio

**Duas rotas, uma só forma de listar.** `/calendarios` e `/revisoes` continuam separadas, mas usam a
mesma tabela, a mesma barra de filtros e o mesmo filtro de campus. Cada tela define só as colunas e as
ações próprias.

|                  | `/calendarios`                              | `/revisoes`                      |
| ---------------- | ------------------------------------------- | -------------------------------- |
| Pergunta da tela | O que existe e o que posso fazer?           | O que preciso analisar agora?    |
| Quem acessa      | Quem edita; o `PARECERISTA` é redirecionado | `ADMIN` e `PARECERISTA`          |
| Conteúdo         | Inclui rascunhos                            | Nunca mostra rascunhos           |
| Eixo principal   | Campus                                      | Situação, com campus como filtro |
| Visões           | Tabela ou galeria, conforme o perfil        | Sempre tabela                    |

Uma tela única encheria o código de condições por perfil e tiraria do parecerista a fila como página
inicial.

## Situação atual

- As duas telas leem quase o mesmo dado: `reviewQueueItem` é `summary` mais `submission` e `review`
  (`convex/contracts.ts`).
- A tabela de calendários fica em `CalendarsPanel.tsx` e `calendars.css`, com colunas fixas, layout por
  container query e estilos presos a `#calendar-list`.
- A fila usa `.records` e o bloco `#review-calendars` de `web/portal.css`, sem colunas. Turmas, turnos e
  processo SEI não aparecem nela.
- A aba da fila fica em `useState` (`ReviewsPage.tsx`): quem abre um parecer em **Em análise** e volta
  cai em **Aguardando análise**.
- `reviewQueue` não aceita campus, e nenhum índice cobre campus, situação e exclusão juntos.
- `bootstrap` omite campi arquivados. Um calendário de campus arquivado fica sem nome de campus, o que
  já acontece hoje em `/calendarios`.
- `.review-tabs` está em `lifecycle.css`, que só chega à fila porque `ReviewQueue` importa o badge de
  situação de `LifecycleActions`.

## Como a fila fica

```text
[Aguardando análise] Em análise  Concluídos  Devolvidos  Vigentes  Arquivados
Filtrar por campus [Todos os campi ▾]

Calendário                         Envio            Parecer                  Ações
Calendário 2027 - Campus Curitiba  Envio 2·reenvio  ● Em andamento · 3 de    [Continuar parecer]
Técnico integrado                  04/11/2026         12 critérios conferidos
Curso de teste                                      Rev. 2 · Ana · 05/11
Processo SEI nº …
```

- O badge de situação sai da linha, porque a aba selecionada já informa isso.
- A fila não tem coluna Campus: o nome gerado já traz o campus, e a coluna deixaria o nome estreito
  demais em viewports de 1280px. Quando o nome não for o gerado, a célula mostra o campus, com a mesma
  regra que a galeria já usa em `CalendarsPanel.tsx`.

## O que continua separado

- `reviewState` continua em `features/reviews`: é regra do parecer, não da lista.
- As abas de situação continuam só na fila.
- A galeria continua só em `/calendarios`.
- `CollectionPanel` não é usado na fila, porque exige `form` e `actionLabel` mesmo com
  `canCreate={false}`.
- A lixeira continua como está: tem dois campos e uma ação.
- `/calendarios` não mostra o progresso do parecer: custaria leituras por linha e repetiria a fila.

## Etapa 1: tabela compartilhada (implementada)

### Componentes

1. Criar `web/features/calendar-list/` com:
   - `CalendarTable`: cabeçalho, linhas e rótulos de célula, com o `id` da lista e as colunas definidos
     por cada tela;
   - `CalendarIdentityCell`: nome, oferta, cursos, turmas, turnos, SEI e **Substituído por**, hoje funções
     dentro de `CalendarsPanel`;
   - `CampusFilter`: o select, a barra de filtros e a validação do campus da URL contra `info.campuses`,
     hoje em `CalendarsPage` e `.calendar-list-tools`.
2. Acessibilidade da tabela: o cabeçalho continua `aria-hidden`, e os rótulos de célula deixam de ficar
   em `display: none` no desktop, passando a `.visually-hidden`. Sem isso, a extração estenderia à fila
   células que o leitor de tela anuncia sem rótulo. Isso também vale para `/calendarios`.
3. Acrescentar `campusName` a `summary`, que já recebe o campus, e usá-lo nas duas telas. `summary`
   também alimenta `calendarDto`, então as fixtures tipadas de editor e portal mudam junto.

### CSS

4. Criar `calendar-list.css` com a base da lista, a tabela e a barra de filtros, em classes.
   `CalendarTable`, `CalendarIdentityCell` e `CampusFilter` o importam, porque as rotas são carregadas
   sob demanda e a galeria não renderiza `CalendarTable`. As regras próprias da galeria ficam em
   `calendars.css`.
5. Criar `web/features/reviews/reviews.css` com `.review-tabs`, importado por `ReviewsPage`. A fila deixa
   de importar o badge de situação, e com ele `lifecycle.css`.
6. Remover `.records` da fila, com as regras de `#review-calendars` de `web/portal.css`. O link de ação
   perde o estilo herdado de `.records a` e passa a usar `ui-button ui-button--primary`.
7. Definir as colunas da fila em 1fr, 8rem, 13rem e 12rem, mantendo o ponto de quebra de 860px de
   container. Pela estimativa, sobram cerca de 280px para o nome com o viewport em 1280px. Conferir na
   tela, inclusive a quebra do badge de duas linhas.

### Migração

8. Migrar `/calendarios` sem mudança visual. `portal-dashboard.png` prova a extração da tabela. Nenhuma
   referência visual cobre a galeria com o perfil `CAMPUS`: criar uma antes de extrair.
9. Em `CalendarsPanel`, receber `calendars` como prop no lugar de `info={{ ...info, calendars }}` e
   remover o filtro repetido no cliente, que o servidor já aplica.
10. Migrar a fila para `CalendarTable`, com as colunas Calendário, Envio, Parecer e Ações. Manter
    `id="review-calendars"`, `data-review-state`, `data-open-review` e `data-submission`.
11. Trocar `.review-queue-state` pelo `StatusBadge` de `components/ui/Feedback.tsx`, acrescentando o tom
    `info` e mapeando `none` para `neutral`. Renomear o `StatusBadge` do ciclo de vida para
    `CalendarStatusBadge`, porque os dois têm o mesmo nome e contratos diferentes.
12. Tirar o `h2` da fila, manter o aviso sobre o SEI como texto curto e deixar as abas visualmente
    distintas dos botões de ação.

### Situação na URL

13. Levar a situação da fila para a URL, em `situacao`:
    - ampliar `documentStatus` em `web/app/search.ts` para aceitar todas as situações de calendário.
      `DocumentsPage` já restringe o valor ao que entende;
    - `ReviewsPage` faz o mesmo e cai em `enviado` para ausente ou inválido, incluindo `rascunho`;
    - `enviado` não vai para a URL, e a troca de aba usa `replace: true`, como o filtro de campus.
14. Preservar os filtros na volta do parecer. Só a URL não basta: o `BackLink` de `WorkspaceLayout.tsx`
    aponta para `back.to` sem `search`. O link da linha leva `situacao` e `campus`, e esse `BackLink`
    repassa só essas duas chaves: repassar tudo traria de volta, por exemplo, o aviso de acesso negado.
15. Completar as abas conforme o padrão ARIA: `aria-controls`, painel focável quando não tiver conteúdo
    focável e índice das setas calculado pela aba focada, não por `status`, que agora muda de forma
    assíncrona.

## Etapa 2: filtro de campus na fila (implementada)

1. Adicionar `.index('by_campusId_and_status_and_deletedAt', ['campusId', 'status', 'deletedAt'])` a
   `calendars`. É só um índice novo em uma tabela pequena: não há migração nem índice `staged`.
2. Aceitar `campusId` opcional em `reviewQueue`, escolhendo o índice conforme o argumento e mantendo a
   ordem atual nos dois casos.
3. Passar `reviewQueue` e `calendarPage` a devolver `{ ...result, page }` com
   `paginationResultValidator`. Hoje elas descartam `splitCursor` e `pageStatus`, contrariando as
   diretrizes do Convex.
4. Mostrar `CampusFilter` na fila, dentro do painel da aba, para não separar a aba do seu painel, com
   `campus` na URL. Trocar de aba preserva o campus e vice-versa.
5. Citar o campus na mensagem de lista vazia, quando houver filtro.
6. Cobrir em `convex-test`: a fila filtrada só traz o campus pedido, a paginação respeita o filtro e o
   perfil `CAMPUS` continua recusado.

## Etapa 3: links entre as telas

Pode virar uma entrega separada, depois da etapa 1, que traz `situacao` na URL e a coluna de ações da
fila.

1. Em `/calendarios`, para quem pode revisar, link **Parecer** nos calendários que não são rascunho,
   só com ícone e com `aria-label` e `title`, como **Nova versão** na tabela. Hoje uma linha tem no máximo
   dois controles, porque excluir e criar nova versão se excluem. O link cria o terceiro: alargar a coluna
   de 9,5rem para cerca de 12,5rem.
2. O link **Parecer** leva `situacao` com a situação do calendário e `campus`, para a trilha voltar à aba
   certa.
3. Na fila, link **Abrir calendário** em outra aba, abaixo da ação principal, como já faz
   `ReviewFormView.tsx`. Na mesma aba, a volta do editor levaria a `/calendarios` ou ao parecer, e não à
   fila.
4. Testar a regra de permissão do link **Parecer** nos dois lados dela, com seletor que prove existir no
   estado oposto.

## Riscos a conferir

- **Largura.** A estimativa da etapa 1 precisa ser confirmada em 1280px e perto dos 860px de container,
  já que os testes atuais usam 1440, 1360 e 1100.
- **Ordem de teclado.** O filtro de campus e o link **Abrir calendário** entram na ordem que
  `page-actions.spec.ts` percorre com `Tab`. As expectativas mudam de propósito.
- **Parâmetro global.** `situacao` é validado em toda a aplicação. O valor ampliado não pode vazar para
  outra tela ao navegar.

## Testes

- **Fixtures da fila.** `portal-navigation.ts`, `review-ui-client.ts` e `review-session-client.ts`
  ignoram situação e campus e precisam respeitar esses argumentos e a transição `startReview`. Hoje
  `review-ui.spec.ts` volta do parecer salvo e ainda vê o calendário em **Aguardando análise**, o que não
  acontece no servidor: salvar o parecer o move para **Em análise**. O teste passa a seguir a aba certa.
- **Seletores.** `page-actions.visual.spec.ts` e `review-ui.spec.ts` usam `.review-queue-state`, que
  some. Passam a usar um atributo de dados no badge, porque `StatusBadge` substitui `className`.
- **Regressões novas:**
  - abrir um parecer em **Em análise**, voltar pela trilha e continuar na mesma aba, com o campus depois da
    etapa 2;
  - entrada direta em `/revisoes` e navegação vinda de outra rota, com as abas estilizadas;
  - URLs diretas com `situacao` e `campus`, recarga e histórico;
  - troca de filtro depois de carregar mais de uma página, sem misturar resultados;
  - setas nas abas;
  - calendário de campus arquivado na fila e em `/calendarios`;
  - `situacao` de calendário em `application-search.test.ts` e em `/documentos`.
- **Ausência.** Remover elementos da lista não ganha asserção de ausência: as asserções sobre eles são
  apagadas. Ausência só é testada quando vem de uma regra, como a permissão do link **Parecer**.

## Verificação

Commits intermediários rodam typecheck, lint e os testes afetados. `pnpm check` roda uma vez antes de
concluir cada etapa.

- **Etapa 1:** `page-actions`, `review-ui`, `router-navigation`, `page-loading`, `portal-navigation`,
  `calendar-trash` e as referências visuais. `reviews.png` muda de propósito, e `portal-dashboard.png` e a
  da galeria só mudam se a extração alterar algo, o que seria defeito.
- **Etapa 2:** `member-roles`, `calendar-lifecycle` e o novo teste do filtro.
- **Etapa 3:** testes de navegador dos links e `page-actions` nas larguras cobertas, em linhas vigentes e
  devolvidas.

## Fora deste plano

**Ordem da fila.** `.order('desc')` segue `_creationTime`, ou seja, o calendário criado por último vem
primeiro. Em **Aguardando análise** o esperado seria o envio mais antigo primeiro, o que exige gravar
`submittedAt` no calendário, com migração. Fica como mudança separada, a registrar em
[Pendências](../pendencias.md).

Também fica de fora o filtro de situação em `/calendarios`, que o novo índice tornaria barato.

## Ao concluir

Levar as decisões para `docs/componentes-interface.md` e `docs/uso.md`, registrar a ordem da fila em
`docs/pendencias.md` e apagar este plano.
