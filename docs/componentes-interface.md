# Componentes da interface

Os componentes compartilhados ficam em `web/components/ui/` e usam Base UI com CSS próprio. A identidade visual permanece a do calendário: verde institucional, superfícies claras e cores de estado com texto explicativo.

- `Button`: variantes `primary`, `secondary` e `danger`. O padrão é `type="button"`; ações de envio de formulário devem declarar `type="submit"`. Use a variante para indicar a intenção, sem depender da lista ou painel em que o botão aparece. Links de navegação continuam sendo elementos `a`.
- `TextField` e `TextAreaField`: associam rótulo, descrição e mensagem de erro ao controle por meio de `Field` da Base UI. `TextAreaField` usa `onValueChange` com o texto atualizado. Passe `disabled` ao componente quando uma operação bloquear o formulário.
- `ChoiceGroup`: apresenta opções exclusivas com Radio Group da Base UI, incluindo interação por teclado. `value={null}` representa uma decisão ainda pendente; um valor selecionado não significa que a decisão foi confirmada.
- `StatusBadge` e `Notice`: identificam estados e evidências com texto. Não use somente cor para transmitir significado.

`tokens.css` centraliza cores semânticas, espaçamentos, raios e duração das transições. `ui.css` define os componentes e os estados de interação, sendo importado pelo CSS compartilhado do site. Campos HTML das telas que ainda não usam os componentes React recebem os mesmos estados de foco e hover. As regras de interação ficam restritas à tela; o modelo de impressão em `web/proens.css` permanece separado.

Mantenha rótulos visíveis, foco por teclado, alvos de toque de pelo menos 44px e suporte a `prefers-reduced-motion`. Botões bloqueados não devem aparentar estar carregando, salvo quando a operação estiver efetivamente em andamento.

Na revisão técnico-pedagógica, a indicação automática é uma evidência para conferência. Escolher uma avaliação, confirmar o critério e salvar a análise são ações distintas. Alterar a avaliação ou as observações invalida a confirmação anterior; a interface deve indicar quando a conferência ainda está por salvar. O teste `test/review-ui-browser.test.ts` cobre essas transições com dados sintéticos, sem acessar um deployment real.
