# Componentes da interface

Os componentes compartilhados ficam em `web/components/ui/` e usam Base UI com CSS próprio. A identidade visual permanece a do calendário: verde institucional, superfícies claras e cores de estado com texto explicativo.

- `Button`: variantes `primary`, `secondary` e `danger`. O padrão é `type="button"`; ações de envio de formulário devem declarar `type="submit"`. Use a variante para indicar a intenção, sem depender da lista ou painel em que o botão aparece. Links de navegação continuam sendo elementos `a`.
- `TextField` e `TextAreaField`: associam rótulo, descrição e mensagem de erro ao controle por meio de `Field` da Base UI. `TextAreaField` usa `onValueChange` com o texto atualizado. Passe `disabled` ao componente quando uma operação bloquear o formulário.
- `ChoiceGroup`: apresenta opções exclusivas com Radio Group da Base UI, incluindo interação por teclado. `value={null}` representa uma decisão ainda pendente; um valor selecionado não significa que a decisão foi confirmada.
- `StatusBadge` e `Notice`: identificam estados e evidências com texto. Não use somente cor para transmitir significado.

`tokens.css` centraliza cores semânticas, espaçamentos, raios e duração das transições. `ui.css` define os componentes e os estados de interação, sendo importado pelo CSS compartilhado do site. As regras de interação ficam restritas à tela; o modelo de impressão em `assets/printing/calendar.css` permanece separado.

Mantenha rótulos visíveis, foco por teclado, alvos de toque de pelo menos 44px e suporte a `prefers-reduced-motion`. Botões bloqueados não devem aparentar estar carregando, salvo quando a operação estiver efetivamente em andamento.

Labels de campos ficam acima do controle, alinhados à esquerda, com fonte de 14px, peso 600 e espaço de 8px até o campo. Legendas de grupos seguem a mesma hierarquia. No foco, o label ou a legenda do grupo ganha o verde de foco, e campos editáveis recebem borda verde e halo suave. O hover não deve sobrepor o destaque de foco. Textos auxiliares e `.field-optional` mantêm peso normal e cor secundária. Labels de checkbox e radio ficam ao lado do controle; não aplique centralização ou peso normal a todos os labels de um fieldset.

Essas regras pertencem ao CSS compartilhado e alcançam também controles HTML nativos, filtros e formulários adicionados dinamicamente pelo editor. Na criação de calendários, Campus, Ano e Organização formam uma linha quando houver espaço; as formas de oferta ficam em grupo próprio, com opções que se reorganizam pela largura disponível do formulário.

Na revisão técnico-pedagógica, a indicação automática é uma evidência para conferência. Escolher uma avaliação, confirmar o critério e salvar a análise são ações distintas. Alterar a avaliação ou as observações invalida a confirmação anterior; a interface deve indicar quando a conferência ainda está por salvar. O teste `test/browser/review-ui.spec.ts` cobre essas transições com dados sintéticos, sem acessar um deployment real.

Os critérios formam uma lista contínua, com divisórias simples e avaliação junto ao critério quando houver espaço. A indicação automática aparece como texto de apoio. As observações começam recolhidas, inclusive quando há texto salvo; o resumo indica que existe uma observação registrada. Abrir ou recolher esse campo não altera o conteúdo nem a conferência. As três opções de avaliação continuam acessíveis por teclado, com confirmação e salvamento separados.

A navegação de seções e formulários usa `web/scroll.ts`: respeita `prefers-reduced-motion`, revela o início de formulários maiores que a tela e reserva a altura real do feedback fixo por meio de `ResizeObserver` e `scroll-padding`. Isso evita offsets fixos que deixam títulos sob avisos quando o texto quebra em mais linhas. Os testes `test/browser/scroll-layout.spec.ts` verificam a visibilidade e a recepção de cliques em desktop e mobile. As capturas visuais não corrigem a rolagem da aplicação antes de comparar as imagens.

## Formulários e navegação

TanStack Form controla preenchimento, validação e submissão, integrado aos campos visuais. Rótulos, descrições e erros são associados ao controle; validação do backend continua obrigatória. Durante submissão, o formulário conserva os valores e apresenta erro sem reset indevido. Dados condicionais e listas são identificados por contexto e ID.

`useDraftForm` conserva os valores e sua referência de comparação em memória, por identidade e entidade. Voltar ao valor original limpa o estado de alteração; preferências de consulta, como o mês de sábados, não representam dados pendentes de aplicação. Campos de senha, tokens e arquivos não entram no registro de rascunhos. Submissões pendentes permanecem vinculadas ao formulário de origem, mesmo ao navegar e voltar.

No editor, os formulários, o estado aplicado e a versão confirmada no Convex são distintos. A exportação tem um controlador compartilhado por calendário; os botões refletem a mesma operação em andamento. Conflitos preservam os dados locais e permitem baixar uma cópia, tentar novamente ou confirmar a saída sem salvar.

TanStack Router controla caminhos e filtros efetivos da URL. Usar links tipados para navegação interna e âncoras próprias para downloads e destinos externos. Mudança de rota deve manter foco visível e anunciar a tela; cancelamento de saída conserva rota e preenchimento.

O painel Devtools só existe em desenvolvimento nas rotas permitidas com `?devtools=1`. Credenciais, links privados, arquivos e tokens ficam fora dos eventos de instrumentação. O teste do painel verifica teclado e ausência de obstrução dos controles em desktop e mobile.
