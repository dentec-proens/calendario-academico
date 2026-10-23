# Arquitetura

O frontend é uma aplicação React e Vite. Convex concentra identidade, sessões, consultas reativas, transações, arquivos e processamento. `server.ts` serve somente o build estático para preview e recusa `/api/*`.

## Componentes

| Componente                | Responsabilidade                                                             |
| ------------------------- | ---------------------------------------------------------------------------- |
| `web/portal/`             | Listas, criação, administração, documentos e revisão em React                |
| `web/native/`             | Autenticação, montagem das páginas, subscriptions e cliente Convex           |
| `web/components/`         | Diálogo React compartilhado, confirmação assíncrona e apresentação semântica |
| `web/app.ts`              | Edição do calendário, aplicação dos formulários e coordenação do salvamento  |
| `web/print.mjs`           | Renderização compartilhada entre prévia anual e PDF                          |
| `src/`                    | Contagem por oferta, períodos, eventos, sugestões e verificações de geração  |
| `convex/native.ts`        | Operações de calendários, catálogo, documentos e revisão                     |
| `convex/nativeAuth.ts`    | Convex Auth, membros ativos, convites e recuperação                          |
| `convex/nativeFiles.ts`   | Validação de uploads, autorização e tickets de arquivos                      |
| `convex/nativeActions.ts` | Extração de texto e geração de PDF em actions Node                           |

`web/native/client.ts` adapta as operações da interface a funções Convex específicas, como criação, salvamento, análise e download. Os caminhos `/api/...` que ainda aparecem no editor pertencem a esse adaptador de interface; o backend recebe argumentos validados para cada função. Os contratos públicos estão nos validadores, nos tipos gerados e nos DTOs do cliente.

O portal e o editor usam `confirmAction` para decisões que exigem confirmação. O `ConfirmationDialogHost`, montado no provider comum, apresenta um `<dialog>` React com fundo escurecido, foco contido, cancelamento por Escape e restauração de foco. Remoções e descarte usam vermelho; ações operacionais usam azul; consequências recebem destaque âmbar. O módulo também oferece variantes âmbar e verde. O callback `onConfirm` mantém o diálogo aberto durante a operação, bloqueia execução duplicada e apresenta falhas para nova tentativa. A importação abre o seletor de arquivos diretamente e pede confirmação somente após validar o conteúdo.

## Persistência e autorização

O schema descreve os campos de cada entidade e usa referências `Id<"tabela">` nas relações. O `_id` nativo é a identidade dos registros; não há envelope genérico de serialização, cópia em `appId`, posição global ou reconstrução de um banco JSON para aplicar diferenças. Cada mutation lê e altera os documentos necessários em uma transação.

| Tabelas                                      | Conteúdo                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `users` e `auth*`                            | Perfil e autorização do membro; contas, credenciais e sessões administradas pelo Convex Auth |
| `campuses` e `calendars`                     | Unidades e metadados dos calendários, separados do conteúdo editável                         |
| `calendarContents`                           | Estado atual, revisão da base incorporada e documentos institucionais usados                 |
| `calendarVersions` e `calendarSnapshots`     | Versões anteriores e seus snapshots completos, inseridos sem regravar o histórico            |
| `reviews` e `reviewVersions`                 | Parecer atual e versões da revisão humana                                                    |
| `histories` e `historyAnalyses`              | Metadados dos PDFs anteriores e análise de texto consultada separadamente                    |
| `documents`                                  | Documentos institucionais, versão, publicação e arquivo                                      |
| `institutionalEvents` e `catalogueRevisions` | Base institucional tipada e revisão por ano                                                  |
| `invitations` e `passwordResets`             | Tokens temporários armazenados como hashes, com vínculo ao membro e consumo único            |
| `audit`                                      | Ação, instante, autor e alvo tipado; campus e calendário quando aplicáveis                   |

Timestamps operacionais são números em milissegundos. Datas acadêmicas usam `YYYY-MM-DD`, sem conversão de fuso. Os DTOs e snapshots de exportação conservam as representações exigidas pelas regras do editor; campos de compatibilidade de exportação não se tornam índices ou identidades do banco.

O backend deriva identidade, papel e campus da sessão. Contas CAMPUS só acessam a unidade autorizada; ADMIN possui acesso de gestão e revisão. Validação de permissões ocorre no backend em cada operação protegida.

PDFs ficam no Convex Storage, referenciados diretamente por `storageId`; URLs são obtidas somente no acesso ao arquivo. `nativeUploads` guarda envios temporários: proprietário autenticado, limite de 8 MB, assinatura PDF e hash SHA-256 calculado no servidor. Um envio validado só pode ser consumido uma vez, e a limpeza preserva os bytes já vinculados ao documento. `nativeFileTickets` guarda apenas o hash do token de download e sua expiração. A geração de PDF usa recursos de impressão próprios e bloqueia a rede do renderizador durante a renderização.

Originais ainda não transferidos conservam `unavailableFile`, com referência à origem e motivo explícito. Seus metadados, análises e vínculos históricos permanecem disponíveis; download ou nova extração retornam indisponibilidade até a transferência autorizada dos bytes. A aplicação não fabrica arquivos substitutos nem mantém PDFs em base64 nos documentos. ADMIN pode restaurar o original no mesmo registro mediante conferência exata do SHA-256, preservando análises e vínculos; veja [Restauração dos originais](restauracao-de-originais.md).

## Edição e concorrência

As consultas Convex atualizam listas e editores por subscription. Transações protegem a consistência no backend; versões esperadas impedem que uma sessão substitua silenciosamente alterações de outra.

Adicionar/Aplicar transfere o preenchimento do formulário para o calendário. O autosave agrupa alterações próximas e serializa gravações. Só a confirmação do backend produz o estado salvo. Formulários ainda não aplicados impedem a substituição reativa de seus dados. Falhas recuperáveis oferecem nova tentativa; conflito ou sessão expirada bloqueiam novas gravações até a resolução indicada.

Durante perda de conexão, as alterações permanecem na sessão e o SDK gerencia operações pendentes. Não existe persistência durável offline: a página deve ficar aberta até confirmar o salvamento. Baixar cópia preserva somente o estado já aplicado ao calendário.

Atualizar a base institucional exige conferência e confirmação no calendário. A revisão usada no calendário corresponde ao seu ano; alterações em outro ano não o desatualizam. Revisões humanas são vinculadas à versão do calendário e à revisão da base; mudanças tornam a análise desatualizada. O salvamento da análise é explícito. Impressão e PDF usam uma versão confirmada.

## Qualidade

TypeScript estrito cobre backend, contratos, cliente, autenticação, entradas React e ferramentas. Parte do editor e das regras usa JavaScript, coberto por lint e testes. Oxlint verifica também Hooks e promises; Prettier padroniza código e documentação.

A conversão dos dados existentes deve preservar os `_id` de usuários e os registros `auth*`, remapear as referências antigas para IDs nativos e conservar integralmente os históricos, snapshots, tokens ainda válidos e referências de arquivos. A aplicação do schema consolidado exige backup completo e ensaio da conversão antes de produção.

Testes de domínio e `convex-test` executam sem deployment remoto. E2E usa apenas um deployment descartável explicitamente configurado. Os comandos de verificação estão no [README](../README.md).
