# Execução do plano de ofertas v4

## 29/10/2026 — conferência inicial

Status: implementação não iniciada. A conferência da §11.1 do
[plano](plano-ofertas-como-entidade.md#111-antes-de-começar) encontrou um
pré-requisito pendente: `main` possui três commits locais ainda não enviados a
`origin/main`. A implementação e as releases M1–M9 ficam pendentes.

### Evidências

| Pré-requisito                   | Resultado                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Intent instalado                | `pnpm exec intent list`: disponível, 17 skills locais                                                                          |
| Codex CLI autenticado           | `codex login status`: autenticado                                                                                              |
| Chromium do Playwright          | Playwright 1.64.1; Chromium iniciou com sucesso                                                                                |
| Permissão de push               | `git push --dry-run origin main:main`: aceito, sem escrita                                                                     |
| Sincronização de `main`         | Pendente: remoto em `6aeb682`, local em `34e35b9`, com três commits adicionais                                                 |
| Convex de produção              | `pnpm exec convex run --prod operations:status --codegen disable`: `paused: false`, `emergency: false`, nenhuma operação ativa |
| Configuração privada de release | `.vercel/release.env` com permissão `600`; diretório de backup existente, absoluto e com permissão `700`                       |
| Acesso ao projeto Vercel        | Consulta autenticada `GET /v9/projects/{projectId}?teamId={orgId}`: HTTP 200                                                   |

Os commits locais pendentes são:

- `d8ee08a`: Documenta o Formulário III em HTML autocontido.
- `6b56aa3`: Padroniza os indicadores de carregamento com um componente compartilhado.
- `34e35b9`: Versiona a configuração de preview do portal para o app Claude.

Esses commits preexistem a esta execução. Não foram enviados ao remoto nem
incluídos em uma release. Antes de iniciar o M1, é necessário conciliar esse
estado e repetir a conferência de sincronização.

Não há ferramenta `list_connected_browsers` disponível nesta sessão. O plano
prevê substituir a conferência do portal por Playwright e o dashboard da Vercel
pela API. A consulta à API foi verificada; o smoke do portal fica para a etapa de
release. A consulta Convex confirmou acesso à CLI, sem necessidade de renovar o
login pelo navegador.

### Estado ao encerrar

Nenhum código, branch, commit ou referência remota foi alterado. Produção recebeu
somente a consulta de estado; não houve backup, migração, expurgo, publicação ou
promoção. Nenhum marco foi implementado nem submetido aos portões de revisão.
Contagens de ensaio, de migração e de uso de legados permanecem pendentes.

O plano já estava como arquivo não rastreado e foi preservado. A única alteração
desta execução é este diário. A validação aplicável é a conferência de formatação
deste Markdown; `pnpm check` não foi executado porque não houve alteração de
código. A suíte de testes não foi aprovada nem substituída pela conferência dos
pré-requisitos.

## 29/10/2026 — retomada e M1

`git ls-remote origin refs/heads/main` confirmou `main` local e remoto em
`34e35b9`. Pré-requisito resolvido pelo responsável; a branch `ofertas-v4` foi
criada a partir desse commit. As sessões de Convex e Vercel do responsável ficam
no perfil **Dentec** do Google Chrome. Os demais resultados da conferência inicial
foram reaproveitados nesta sessão.

O M1 adiciona os contratos puros de conteúdo v4, identidade e tipo de oferta,
derivações de organização e etapas, reserva de ids citados em registros e
conversão v2/v3 para v4. A persistência e as telas continuam em v3 neste marco.
A fixture compartilhada contém integrado anual e três graduações independentes,
incluindo as duas configurações semestrais previstas no plano.

Antes da refatoração M2/M3, foram capturados 18 cenários do domínio v3 em um
oráculo estático. Ele conserva contagem e hash do ledger, requisitos,
aplicabilidade, mínimos, diagnósticos, base, janela e prontidão. As expectativas
não têm modo de atualização pelo código novo. SHA-256 do JSON capturado:
`eff78c9cb6b7e88f6061bb4a2b40c99a2cce22c2e054cc2490b569dd9e77e75c`.

Validação: `pnpm typecheck` e `pnpm lint` passaram. Os testes do modelo e conversor
e os 18 casos do oráculo passaram. Os dois portões do M1 foram aprovados, sem
achados bloqueantes ou importantes abertos. A revisão de conformidade identificou
que o indicador histórico de ingresso poderia apagar uma resposta explícita já
confirmada; a correção preserva respostas `yes`/`no` e `required`. As duas
regressões falharam antes da correção e passaram depois (23 testes do conversor).

O primeiro `pnpm check` encontrou um `Error` genérico no helper de etapas. Ele foi
substituído por `DomainError`, conforme o contrato de arquitetura. A segunda
execução passou em **205,8 s**: formatação, lint, lint de tipos, quatro projetos
TypeScript, skills, build, testes unitários e **291 testes de navegador**,
incluindo referências visuais desktop e mobile, sem atualização das imagens.

Na preparação do M2 foi identificada uma perda de informação adicional: em 2026,
o indicador geral `secondSemesterIntake` e o mapa por oferta são independentes.
A derivação literal prevista no plano pode alterar a exigência de
`registration-2`. O caso foi enviado ao painel de três julgadores independentes,
incluindo Codex CLI em modo read-only. A decisão será registrada no M2 antes de
alterar o modelo ou a política. Este marco ainda não troca o domínio consumidor.
