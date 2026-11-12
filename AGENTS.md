<!-- intent-skills:start -->

## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before editing files for a substantial task:

- Run `pnpm exec intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `pnpm exec intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.

<!-- intent-skills:end -->

## Fase do projeto

- O app está em fase alpha. Refatorações que deixem o código mais claro, simples ou coeso são desejadas, inclusive quando surgem no caminho de outra tarefa: renomear conceitos, remover código morto e caminhos antigos, consolidar duplicações e ajustar os testes junto.
- Não preserve compatibilidade de código: funções Convex, componentes, tipos e nomes podem mudar sem aliases, wrappers ou camadas de transição. A exceção são os dados já gravados em produção, que continuam exigindo migração conforme a seção de release.
- Refatorações ligadas à área alterada dispensam consulta prévia; descreva-as no resumo final. Reestruturações amplas, fora do escopo da tarefa, devem ser propostas antes.

## Formulários e arquitetura

- Ao criar ou alterar formulários, confira os exports e tipos da versão instalada de `@tanstack/react-form` e consulte a [composição oficial](https://tanstack.com/form/latest/docs/framework/react/guides/form-composition) e as [regras de valores assíncronos](https://tanstack.com/form/latest/docs/framework/react/guides/async-initial-values).
- Router define rotas em código e valida o estado da URL. TanStack Form possui os valores de preenchimento; comandos puros aplicam alterações ao calendário; somente confirmação Convex representa gravação concluída.
- Formulários com senhas, códigos, tokens ou arquivos têm identidade privada na instrumentação. Esses valores permanecem efêmeros; formulários mistos podem conservar somente os demais campos com `excludeFromDraft`. Use o hook compartilhado de formulários para preservar esse contrato.

## Normas

- O texto literal das normas que o sistema implementa fica em `docs/normas/`, copiado da publicação oficial, com o link de origem no topo de cada arquivo. A Resolução CONSUP/IFPR nº 292/2026 (calendário de referência de 2027) está em [`docs/normas/resolucao-consup-292-2026.md`](docs/normas/resolucao-consup-292-2026.md).
- Antes de criar ou mudar uma regra, um critério ou um texto que cite a norma, consulte o texto literal; não parta de paráfrases do código (`criteria.ts`, `requirements.ts`), que podem acrescentar o que a norma não diz. Uma leitura que vá além do texto é uma interpretação: registre-a com a fonte da decisão em `history.ts` da política.
- Não edite o texto copiado. Para uma norma nova ou republicada, baixe a publicação do SEI, converta para Markdown sem alterar palavras nem numeração (o SEI pode gerar numeração por CSS) e confira que nenhuma palavra mudou.

## Planos

- Planos de implementação ficam em `docs/plans/` só enquanto a implementação acontece. Ao concluí-la, leve as decisões que continuam valendo para a documentação permanente (`docs/arquitetura-convex.md`, `docs/uso.md`, `docs/componentes-interface.md`, `docs/migracao-schema.md`), registre o que ficou para depois em [Pendências](docs/pendencias.md) e apague o plano; o histórico fica no Git. Comentários de código e testes explicam a regra em vez de citar seções de plano.
- `docs/uso.md` guarda só regras de negócio e decisões que o código não explica sozinho (permissões, bloqueios, contagem, normas, impressão oficial), em tópicos curtos. Não descreva ali a interface — nomes de botões, posição de controles, textos de apoio ou o caminho de cliques —, que fica no código e nos testes de navegador. Mudanças só de interface não exigem editar esse arquivo.

## Testes e validação

- Consulte [Verificação](docs/verificacao.md) para comandos, referências visuais e configuração dos ambientes de teste. Mantenha o README como apresentação e ponto de entrada; documente procedimentos nos guias de `docs/`.
- Durante o desenvolvimento, rode a menor suíte que exercite o comportamento afetado. Para corrigir um bug, acrescente uma regressão que reproduza o problema pela mesma interação ou fluxo real e confirme a falha antes da correção quando viável.
- Antes de concluir ou commitar mudanças de código, execute `pnpm check`. Para alterações apenas de documentação, confira a formatação dos arquivos alterados; a suíte completa é dispensável.
- Em trabalho dividido em fases ou passos com vários commits, como os roteiros de `docs/plans/`, os commits intermediários rodam typecheck, lint e os testes afetados (unitários, `convex-test` e navegador das áreas tocadas); `pnpm check` roda uma vez antes de concluir a fase, e uma falha nele é corrigida antes do último commit. Cada commit intermediário fica em estado verde nessas verificações.
- A validação é local, neste macOS, com `pnpm check`. Para mudanças de UI, CSS, navegação ou infraestrutura de navegador, verifique desktop e mobile e, quando afetados, teclado, foco e controles desobstruídos, cobertos pela suíte local.
- O PDF do calendário vem da impressão do navegador sobre a prévia (`window.print()`). Mudanças em `src/printing/` ou `assets/printing/calendar.css` exigem conferir a impressão no Chromium.
- Atualize referências visuais somente para mudanças intencionais: inspecione as imagens e diferenças, atualize as referências do macOS (`darwin`) conforme a Verificação e rode novamente a comparação sem atualização. Corrija defeitos na aplicação; preserve a capacidade dos testes de detectar o problema, sem contornos de interação ou tolerâncias ampliadas apenas para obter aprovação.
- Execute E2E remoto com opt-in explícito: deployment descartável ou desenvolvimento atual autorizado pelo usuário, verificado contra `.env.local` e com conta, campus, ano e registros exclusivos da suíte. Produção fica bloqueada; dados preexistentes não podem ser alterados pela suíte. Consulte em [Verificação](docs/verificacao.md#e2e-com-convex) a configuração e os limites de cada modo.
- Reutilize resultados obtidos sobre o mesmo código; repita as verificações afetadas após novas alterações. Ao concluir, informe comandos executados, resultados e limitações. Se faltar navegador ou configuração, registre a verificação pendente e sua causa; testes pulados ou não executados não contam como aprovação.

## Release para produção

- Pedidos de release, deploy ou publicação em produção usam `pnpm deploy:production`, sem `pnpm check` ou suítes adicionais. Ele preserva o typecheck do Convex e o build remoto da Vercel. A implementação de mudanças de código, inclusive nessa ferramenta, continua sujeita à validação de desenvolvimento acima.
- Mudanças que alteram dados existentes usam migrações em `convex/migrations.ts`: schema alargado com a migração em `pending` numa release, schema estreitado em qualquer release posterior. Classifique o risco pelos [níveis de migração](docs/implantacao-convex-vercel.md#níveis-de-risco) e aplique só o que o nível exige; ensaio restaurado, manutenção e verificadores próprios são do nível 2.
- Antes de publicar ou recuperar uma release parcial, consulte [Implantação e operação](docs/implantacao-convex-vercel.md), incluindo backup, reserva exclusiva e migrações.

## Commits

- Mensagens de commit devem ser explicativas, em português, não apenas uma linha curta.
- Use uma primeira linha objetiva com o resumo da mudança.
- Inclua um corpo explicando contexto, principais alterações e validação feita quando houver.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
