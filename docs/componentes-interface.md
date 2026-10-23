# Componentes da interface

Os componentes compartilhados ficam em `web/components/ui/` e usam Base UI com CSS próprio. A identidade visual permanece a do calendário: verde institucional, superfícies claras e cores de estado com texto explicativo.

- `Button`: variantes `primary`, `secondary` e `danger`. O padrão é `type="button"`; ações de envio de formulário devem declarar `type="submit"`. Use a variante para indicar a intenção, sem depender da lista ou painel em que o botão aparece. Links de navegação continuam sendo elementos `a`.
- `TextField` e `TextAreaField`: associam rótulo, descrição e mensagem de erro ao controle por meio de `Field` da Base UI. `TextAreaField` usa `onValueChange` com o texto atualizado. Passe `disabled` ao componente quando uma operação bloquear o formulário.
- `ChoiceGroup`: apresenta opções exclusivas com Radio Group da Base UI, incluindo interação por teclado. `value={null}` representa uma decisão ainda pendente; um valor selecionado não significa que a decisão foi confirmada.
- `StatusBadge` e `Notice`: identificam estados e evidências com texto. Não use somente cor para transmitir significado.

`tokens.css` centraliza cores semânticas, espaçamentos, raios e duração das transições. `ui.css` define os componentes e os estados de interação, sendo importado pelo CSS compartilhado do site. Campos HTML das telas que ainda não usam os componentes React recebem os mesmos estados de foco e hover. As regras de interação ficam restritas à tela; o modelo de impressão em `web/proens.css` permanece separado.

Mantenha rótulos visíveis, foco por teclado, alvos de toque de pelo menos 44px e suporte a `prefers-reduced-motion`. Botões bloqueados não devem aparentar estar carregando, salvo quando a operação estiver efetivamente em andamento.

Labels de campos ficam acima do controle, alinhados à esquerda, com fonte de 14px, peso 600 e espaço de 8px até o campo. Legendas de grupos seguem a mesma hierarquia. No foco, o label ou a legenda do grupo ganha o verde de foco, e campos editáveis recebem borda verde e halo suave. O hover não deve sobrepor o destaque de foco. Textos auxiliares e `.field-optional` mantêm peso normal e cor secundária. Labels de checkbox e radio ficam ao lado do controle; não aplique centralização ou peso normal a todos os labels de um fieldset.

Essas regras pertencem ao CSS compartilhado e alcançam também controles HTML nativos, filtros e formulários adicionados dinamicamente pelo editor. Na criação de calendários, Campus, Ano e Organização formam uma linha quando houver espaço; as formas de oferta ficam em grupo próprio, com opções que se reorganizam pela largura disponível do formulário.

Na revisão técnico-pedagógica, a indicação automática é uma evidência para conferência. Escolher uma avaliação, confirmar o critério e salvar a análise são ações distintas. Alterar a avaliação ou as observações invalida a confirmação anterior; a interface deve indicar quando a conferência ainda está por salvar. O teste `test/browser/review-ui.spec.ts` cobre essas transições com dados sintéticos, sem acessar um deployment real.

A navegação de seções e formulários usa `web/scroll.ts`: respeita `prefers-reduced-motion`, revela o início de formulários maiores que a tela e reserva a altura real do feedback fixo por meio de `ResizeObserver` e `scroll-padding`. Isso evita offsets fixos que deixam títulos sob avisos quando o texto quebra em mais linhas. Os testes `test/browser/scroll-layout.spec.ts` verificam a visibilidade e a recepção de cliques em desktop e mobile. As capturas visuais não corrigem a rolagem da aplicação antes de comparar as imagens.
