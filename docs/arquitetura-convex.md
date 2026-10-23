# Arquitetura Convex

O portal usa React e Vite; funções, identidade, sessões e arquivos ficam no Convex. Existe um único caminho de execução. `pnpm dev` combina o watcher Convex com o servidor de desenvolvimento Vite. `pnpm build` emite `dist/app`; `server.ts` é apenas um preview estático e recusa `/api/*`.

## Fronteiras

`web/native/client.ts` adapta as operações do portal ao SDK Convex. A notação interna de caminhos é uma interface do domínio, não um endpoint HTTP Node. Status e membros derivam dos tipos gerados de funções; DTOs tipam os demais dados do cliente. As consultas React são subscriptions e recebem atualizações automaticamente.

`convex/native.ts` concentra as operações de calendário, catálogo, documentos e revisão. `nativeAuth.ts` usa Convex Auth e confere o membro ativo e o campus. `nativeFiles.ts` valida tickets, uploads e downloads. `nativeActions.ts` executa extração de texto e geração de PDF. As funções auxiliares de snapshots/auditoria são internas ao backend; não existe uma ponte com segredo compartilhado.

As transações usam o controle de concorrência do Convex. A revisão esperada de um calendário continua sendo uma regra de negócio: duas sessões não podem substituir silenciosamente o trabalho uma da outra. Revisões humanas também são associadas à versão conferida e ficam desatualizadas quando o calendário ou a base muda.

## Compatibilidade dos dados

Os documentos atuais conservam os IDs da aplicação importada. O schema permanece compatível com os dados existentes; fotografias completas ficam separadas dos metadados das versões. O codec preserva propriedades explicitamente indefinidas e nomes reservados do formato original. Essa compatibilidade não exige manter o backend anterior.

Membros de CAMPUS recebem somente registros da unidade autorizada. O backend deriva identidade, função e campus da sessão, não de parâmetros de autorização enviados pelo navegador. Uploads são vinculados ao proprietário e consumidos uma única vez. Downloads são privados e temporários. Nenhum segredo administrativo faz parte da resposta pública.

## Edição e reatividade

Formulários têm confirmação local por Adicionar/Aplicar; alterações aplicadas são salvas automaticamente. Campos não aplicados têm um indicador próprio e bloqueiam substituição reativa. Falhas, sessão expirada e conflitos são apresentados sem declarar sucesso. Durante queda de conexão, o SDK controla as mutations pendentes; a página deve permanecer aberta até a confirmação. Não há persistência durável offline implementada.

A atualização de uma revisão institucional exige conferência explícita neste calendário. A análise humana possui seu próprio salvamento com autoria. PDF e impressão usam uma versão confirmada. Logo e estilos da visualização são assets do build; a action PDF incorpora seus próprios recursos e bloqueia a rede do renderizador.

## Qualidade e evolução

TypeScript 7 estrito cobre backend, contratos, cliente, autenticação, entradas React e ferramentas. O editor e regras maiores em JavaScript são mantidos durante a evolução incremental, com testes do domínio. Não são usados `ts-nocheck` ou casts gerais para simular uma conversão completa.

Oxlint verifica JavaScript e TypeScript; o lint com tipos abrange as fronteiras tipadas e o código da aplicação. Os testes de domínio e `convex-test` não precisam de um serviço remoto. A suíte E2E exige um deployment explicitamente descartável. A CI executa o mesmo `pnpm check` usado localmente, sem iniciar um segundo banco nem publicar dados.
