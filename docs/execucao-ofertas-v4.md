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

## 29/10/2026 — M2 em validação

O painel aprovou **3/3** a preservação de `legacySecondSemesterIntake` somente
quando a política de 2026 usa o segundo ciclo e a derivação mudaria a exigência
operacional antiga. Os dois julgadores subagentes e o Codex CLI read-only votaram
independentemente. A exceção não altera o ingresso das ofertas; `false` conserva
a dispensa antiga, e `true` pode conservar a exigência quando o indicador antigo
estava ausente. O plano foi atualizado nas §§3.2–3.3, 6.2, 6.4 e 11.6. As
condições incluem persistência completa e retirada junto da política quando a
medição de uso real permitir no M9.

O domínio passa a trabalhar com identidades de oferta em contagem, atividades,
comandos, diagnósticos, base institucional e apoio ao parecer. O novo normalizador
e a preparação pura de salvamento v4 convivem com a fronteira v3 das telas e da
persistência, que serão trocadas nos M5/M6. Aliases de saída e leitura de entradas
antigas permanecem temporariamente para essa convivência. Os validadores das
tabelas Convex não mudaram neste marco.

As etapas novas ou editadas precisam caber no período do seu ciclo; etapas
migradas inconsistentes ficam visíveis em avisos e não impedem salvar outras
partes. Rótulos repetidos, ids duplicados, configurações de etapas inválidas e
mudança do tipo de uma oferta já salva são recusados. Eventos institucionais
selecionados por tipo são materializados para os ids de todas as ofertas daquele
tipo. A identidade canônica da base conserva os tipos distintos e o formato de
hash anterior.

Os 18 casos do oráculo passaram tanto na entrada v3 quanto após conversão v4,
sem alterar o JSON capturado. A comparação lexical dos avisos corrige em ambos os
lados uma colisão de nomes idênticos entre etapas de tipos distintos; requisitos,
aplicabilidade, contagem e demais expectativas continuam integrais. Os testes
novos cobrem as quatro ofertas de referência, comandos, salvamento e a matriz de
decisões de ingresso de 2026, incluindo v2 combinado e v3 misto.

Validação parcial: `pnpm test:unit` passou em 10,66 s com **570 testes** (antes da
última regressão de legado); `pnpm typecheck`, `pnpm lint` e `pnpm lint:types`
passaram. A suíte de legado depois da última inclusão passou com 11 testes.
Revisões independentes de conformidade e equivalência e `pnpm check` completo
estão em andamento.

Primeira rodada de revisão do M2: três problemas de implementação foram
confirmados e corrigidos: os vínculos de resultados/conselhos/reuniões de etapas
sem quantidade classificada também precisam ser preservados; o apoio ao parecer
precisa filtrar mínimos e janela por ofertas abrangidas; a referência anual de
2026 recebe `kind`, não id opaco. As três regressões direcionadas passaram.

A revisão também identificou um segundo conflito do plano: a confirmação global
antiga da Resolução 292 bloqueava pós-graduação com escopo ausente ou norma
própria, mas o v4 deliberadamente não copia esse escopo excluído. O painel
independente aprovou **3/3** retirar somente esse impedimento residual. O plano
foi atualizado nas §§4, 6.2, 6.4 e 7; o verificador M7 aceitará exclusivamente a
diferença prevista, mantendo os demais impedimentos. Quatro regressões cobrem
as três origens do escopo e o calendário misto; todas passaram.

O `pnpm check` desta rodada passou em todas as etapas rápidas, mas terminou com
290/291 testes de navegador aprovados em 208,7 s. Falhou o fluxo de recuperação
de chunk após versão nova: o campo limpo ainda aparecia preenchido, deixando a
atualização bloqueada. Foi iniciada investigação dirigida com a skill
`diagnosing-bugs`; três repetições isoladas do mesmo fluxo passaram, e a causa
ainda está em investigação. Nenhuma tolerância, timeout ou interação foi
alterada para obter aprovação. O marco não será concluído com esse resultado
incompleto.

Na segunda rechecagem de equivalência, o mesmo achado do parecer ainda atingia a
escolha entre critério anual/semestral. O julgamento agora usa a organização das
ofertas abrangidas, conservando o resumo geral apenas como informação. A
regressão de anual abrangida com semestral de norma própria passou. Na terceira
rechecagem, o portão de equivalência foi aprovado sem achados abertos.

A investigação de foco reproduziu a falha original uma vez em 40 repetições. A
captura de eventos comprovou que o `requestAnimationFrame` de `CollectionPanel`
focava o título entre o foco no campo e a tecla Delete; a tecla chegava ao título,
sem evento de edição no campo. O callback agora preserva foco e rolagem quando o
usuário já selecionou um controle dentro do painel. A regressão determinística
falhou em desktop e mobile antes da correção e passou nos dois depois; também
confere o foco inicial no título e Tab para Campus. O teste original de atualização
permaneceu intacto e passou em 20/20 repetições com quatro workers. As suítes de
navegação portal/Router passaram com 21/21 casos. Nenhuma sonda ficou no código.

A revisão final de conformidade aprovou a correção pontual de foco, sem novos
achados. Os dois portões M2 estão aprovados, condicionados à validação completa
do código final. Uma nova execução coordenada de `pnpm check` foi iniciada.

Resultado final do M2: **`pnpm check` aprovado em 206,1 s**, com todas as etapas
rápidas e **293 testes de navegador** aprovados. Referências visuais inalteradas.
Nenhum bloqueante ou importante permanece aberto nos portões; os limites de
três rodadas foram respeitados. Nenhuma operação de escrita ou publicação foi
realizada em produção.
