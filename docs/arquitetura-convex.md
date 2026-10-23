# Arquitetura

O frontend é uma aplicação React e Vite. Convex concentra identidade, sessões, consultas reativas, transações, arquivos e processamento. `server.ts` serve somente o build estático para preview e recusa `/api/*`.

## Componentes

| Componente                | Responsabilidade                                                            |
| ------------------------- | --------------------------------------------------------------------------- |
| `web/portal/`             | Listas, criação, administração, documentos e revisão em React               |
| `web/native/`             | Autenticação, montagem das páginas, subscriptions e cliente Convex          |
| `web/app.js`              | Edição do calendário, aplicação dos formulários e coordenação do salvamento |
| `web/print.mjs`           | Renderização compartilhada entre prévia anual e PDF                         |
| `src/`                    | Contagem por oferta, períodos, eventos, sugestões e verificações de geração |
| `convex/native.ts`        | Operações de calendários, catálogo, documentos e revisão                    |
| `convex/nativeAuth.ts`    | Convex Auth, membros ativos, convites e recuperação                         |
| `convex/nativeFiles.ts`   | Validação de uploads, autorização e tickets de arquivos                     |
| `convex/nativeActions.ts` | Extração de texto e geração de PDF em actions Node                          |

`web/native/client.ts` adapta as operações da interface ao SDK Convex. Os caminhos `/api/...` usados internamente identificam operações do domínio; não correspondem a uma API HTTP no servidor de preview. Os contratos públicos estão nas funções Convex, nos tipos gerados e nos DTOs do cliente.

## Persistência e autorização

Os dados correntes ficam em documentos Convex. Versões de calendários conservam metadados e referências a snapshots completos; revisões humanas têm seu próprio histórico. Os identificadores de domínio permanecem estáveis nas relações entre registros e arquivos. O codec em `src/convex-codec.mjs` serializa os valores utilizados pelos registros e snapshots.

O backend deriva identidade, papel e campus da sessão. Contas CAMPUS só acessam a unidade autorizada; ADMIN possui acesso de gestão e revisão. Validação de permissões ocorre no backend em cada operação protegida.

PDFs ficam no Convex Storage. Uploads exigem proprietário autenticado, limite de tamanho, assinatura PDF e conferência do hash. Um upload validado só pode ser consumido uma vez. Downloads exigem autorização e tickets temporários. A geração de PDF usa recursos de impressão próprios e bloqueia a rede do renderizador durante a renderização.

## Edição e concorrência

As consultas Convex atualizam listas e editores por subscription. Transações protegem a consistência no backend; versões esperadas impedem que uma sessão substitua silenciosamente alterações de outra.

Adicionar/Aplicar transfere o preenchimento do formulário para o calendário. O autosave agrupa alterações próximas e serializa gravações. Só a confirmação do backend produz o estado salvo. Formulários ainda não aplicados impedem a substituição reativa de seus dados. Falhas recuperáveis oferecem nova tentativa; conflito ou sessão expirada bloqueiam novas gravações até a resolução indicada.

Durante perda de conexão, as alterações permanecem na sessão e o SDK gerencia operações pendentes. Não existe persistência durável offline: a página deve ficar aberta até confirmar o salvamento. Baixar cópia preserva somente o estado já aplicado ao calendário.

Atualizar a base institucional exige conferência e confirmação no calendário. Revisões humanas são vinculadas à versão do calendário e à revisão da base; mudanças tornam a análise desatualizada. O salvamento da análise é explícito. Impressão e PDF usam uma versão confirmada.

## Qualidade

TypeScript estrito cobre backend, contratos, cliente, autenticação, entradas React e ferramentas. Parte do editor e das regras usa JavaScript, coberto por lint e testes. Oxlint verifica também Hooks e promises; Prettier padroniza código e documentação.

Testes de domínio e `convex-test` executam sem deployment remoto. E2E usa apenas um deployment descartável explicitamente configurado. Os comandos de verificação estão no [README](../README.md).
