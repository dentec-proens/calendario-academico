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

## Formulários e arquitetura

- Ao criar ou alterar formulários, confira os exports e tipos da versão instalada de `@tanstack/react-form` e consulte a [composição oficial](https://tanstack.com/form/latest/docs/framework/react/guides/form-composition) e as [regras de valores assíncronos](https://tanstack.com/form/latest/docs/framework/react/guides/async-initial-values). Essa dependência não distribui uma skill no pacote; a descoberta Intent não substitui essa consulta.
- Router define rotas em código e valida o estado da URL. TanStack Form possui os valores de preenchimento; comandos puros aplicam alterações ao calendário; somente confirmação Convex representa gravação concluída.
- Formulários com senhas, códigos, tokens ou arquivos têm identidade privada na instrumentação. Esses valores permanecem efêmeros; formulários mistos podem conservar somente os demais campos com `excludeFromDraft`. Use o hook compartilhado de formulários para preservar esse contrato.

## Testes e validação

- Consulte [Verificação](docs/verificacao.md) para comandos, referências visuais e configuração dos ambientes de teste. Mantenha o README como apresentação e ponto de entrada; documente procedimentos nos guias de `docs/`.
- Durante o desenvolvimento, rode a menor suíte que exercite o comportamento afetado. Para corrigir um bug, acrescente uma regressão que reproduza o problema pela mesma interação ou fluxo real e confirme a falha antes da correção quando viável.
- Antes de concluir ou commitar mudanças de código, execute `pnpm check`. Para alterações apenas de documentação, confira a formatação dos arquivos alterados; a suíte completa é dispensável.
- A validação é local, neste macOS, com `pnpm check`; o repositório não usa CI do GitHub nem suítes de navegador em Linux ou Docker. Para mudanças de UI, CSS, navegação ou infraestrutura de navegador, verifique desktop e mobile e, quando afetados, teclado, foco e controles desobstruídos, cobertos pela suíte local.
- O PDF do calendário vem da impressão do navegador sobre a prévia (`window.print()`), sem gerador no servidor. Mudanças em `src/printing/` ou `assets/printing/calendar.css` exigem conferir a impressão no Chromium.
- Atualize referências visuais somente para mudanças intencionais: inspecione as imagens e diferenças, atualize as referências do macOS (`darwin`) conforme a Verificação e rode novamente a comparação sem atualização. Corrija defeitos na aplicação; preserve a capacidade dos testes de detectar o problema, sem contornos de interação ou tolerâncias ampliadas apenas para obter aprovação.
- Execute E2E remoto com opt-in explícito: deployment descartável ou desenvolvimento atual autorizado pelo usuário, verificado contra `.env.local` e com conta, campus, ano e registros exclusivos da suíte. Produção fica bloqueada; dados preexistentes não podem ser alterados pela suíte. Consulte no README a configuração e os limites de cada modo.
- Reutilize resultados obtidos sobre o mesmo código; repita as verificações afetadas após novas alterações. Ao concluir, informe comandos executados, resultados e limitações. Se faltar navegador, Docker ou configuração, registre a verificação pendente e sua causa; testes pulados ou não executados não contam como aprovação.

## Release para produção

- Pedidos de release, deploy ou publicação em produção usam `pnpm deploy:production`, sem `pnpm check` ou suítes adicionais. Ele preserva o typecheck do Convex e o build remoto da Vercel. A implementação de mudanças de código, inclusive nessa ferramenta, continua sujeita à validação de desenvolvimento acima.
- Mudanças que alteram dados existentes usam migrações em `convex/migrations.ts`, publicadas em duas releases: schema alargado com a migração em `pending`, depois o schema estreitado.
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
