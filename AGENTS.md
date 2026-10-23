## Desenvolvimento em Windows

- Toda alteração neste repositório deve preservar o suporte ao desenvolvimento em Windows: instalação, execução local, build, testes e ferramentas auxiliares. Windows é um ambiente de desenvolvimento suportado, inclusive nas decisões sobre dependências e infraestrutura.
- Prefira scripts multiplataforma e APIs de Node para processos e caminhos. Comandos documentados devem funcionar no PowerShell; dependências de Bash, utilitários Unix, permissões ou caminhos específicos de macOS/Linux precisam de uma alternativa funcional no Windows.
- Quando um componente exigir Linux, ofereça um caminho de execução pelo Docker Desktop com containers Linux no Windows e documente os pré-requisitos no README. Os comandos obrigatórios de validação também devem funcionar nesse fluxo, incluindo referências visuais compatíveis com o ambiente em que os testes executam.
- Para mudanças que afetem a portabilidade, valide o fluxo em Windows, localmente ou no CI. Se essa validação não estiver disponível, informe a pendência explicitamente; resultados em macOS ou Linux não comprovam suporte ao Windows.

## Testes e validação

- Consulte [Verificação no README](README.md#verificação) para instalação, comandos, referências visuais e configuração dos ambientes. Mantenha esses detalhes no README.
- Durante o desenvolvimento, rode a menor suíte que exercite o comportamento afetado. Para corrigir um bug, acrescente uma regressão que reproduza o problema pela mesma interação ou fluxo real e confirme a falha antes da correção quando viável.
- Antes de concluir ou commitar mudanças de código, execute `pnpm check`. Para alterações apenas de documentação, confira a formatação dos arquivos alterados; a suíte completa é dispensável.
- Mudanças de UI, CSS, navegação ou infraestrutura de navegador exigem também `pnpm test:linux`, que reproduz o ambiente do CI. Verifique desktop e mobile e, quando afetados, teclado, foco e controles desobstruídos.
- Mudanças no gerador de PDF, modelo de impressão ou dependências do runtime exigem `pnpm test:runtime:linux`, dispensável se `pnpm test:linux` já passou no mesmo estado do código.
- Atualize referências visuais somente para mudanças intencionais: inspecione as imagens e diferenças, atualize os sistemas afetados conforme o README e rode novamente a comparação sem atualização. Corrija defeitos na aplicação; preserve a capacidade dos testes de detectar o problema, sem contornos de interação ou tolerâncias ampliadas apenas para obter aprovação.
- Execute E2E remoto somente com um deployment explicitamente descartável e a configuração exigida no README. Produção, dados importados e ambientes compartilhados ficam fora desses testes.
- Reutilize resultados obtidos sobre o mesmo código; repita as verificações afetadas após novas alterações. Ao concluir, informe comandos executados, resultados e limitações. Se faltar navegador, Docker ou configuração, registre a verificação pendente e sua causa; testes pulados ou não executados não contam como aprovação.

## Commits

- Mensagens de commit devem ser explicativas, em português, não apenas uma linha curta.
- Use uma primeira linha objetiva com o resumo da mudança.
- Inclua um corpo explicando contexto, principais alterações e validação feita quando houver.
