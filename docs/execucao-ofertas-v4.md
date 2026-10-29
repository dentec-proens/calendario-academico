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

## 29/10/2026 — M3 em validação

O contrato de política passa a receber `CalendarOffer` em aplicabilidade, notas
e mínimos; `excludes(offer)` substitui a lista pública de modalidades excluídas.
Cada mínimo possui `days` e `basis`. A contagem extrai os mesmos números de antes:
200 anuais e 100 semestrais em 2027, incluindo ambas as conferências na
organização semestral; 2026 e anos sem norma continuam sem mínimos automáticos.
Os wrappers transitórios resolvem ids por correspondência exata com a oferta,
sem inferir tipo pelo texto do id.

A entrada `consup-292-2027-v3`, de efeito editorial, registra a aplicação por
oferta e a numeração por ciclo. A fronteira de revisão continua equivalente à
v2. Os fingerprints publicados foram preservados; a nova entrada tem o mesmo
fingerprint da v2 na fronteira de referência v3, cuja redação de compatibilidade
permanece estável. O JSON do oráculo original não foi alterado.

Os portões de conformidade e equivalência aprovaram o M3 sem achados. O revisor
de equivalência fez também uma comparação independente com a política anterior:
5.931 comparações, em 19 estados e três variantes de escopo, sem divergências.
Typecheck completo e 61 testes direcionados passaram; a revisão React dos dois
consumidores TSX não identificou novos hooks, efeitos ou proprietários de valores.

As imagens de regras e adoção de regras mudam apenas pela versão atual e pela
nova entrada do histórico. As quatro imagens reais e suas diferenças foram
inspecionadas em desktop/mobile, incluindo o final da página mobile em tamanho
legível; não há corte de texto ou controles sobrepostos. As referências macOS
afetadas estão sendo atualizadas e serão comparadas novamente sem atualização
antes de `pnpm check`.

As quatro referências editoriais foram atualizadas após inspeção e os seis casos
de comparação passaram novamente sem atualização. `pnpm test:unit` passou com
581 testes em 11,00 s; tipos e lint de tipos passaram. A primeira execução
completa do M3 aprovou as etapas rápidas, mas teve 18 falhas de navegador em
216,1 s: uma no cenário de reversão de semana e 17 comparações com deslocamento
de poucos pixels nas setas nativas de selects.

O diagnóstico da semana reproduziu a falha 3/3 e comprovou um único diff:
`rulesetVersion` de v2 para v3. A fixture padrão ainda fixava v2; a sessão
carimbava legitimamente a política corrente ao editar. A fixture passa a obter a
versão pelo registry, e o cenário de reversão afirma esse baseline corrente. O
cenário de legado continua explicitamente sem versão, com asserção própria.
Sessão, debounce e expectativa de zero saves não foram alterados. Os 23 testes
relacionados passaram.

As setas foram comparadas também com o código do M2 no mesmo Chromium: resultado
idêntico ao M3, afastando regressão da aplicação. A feature `OverlayScrollbar`
explicou a variação. O ambiente sintético macOS/Chromium agora fixa a variante das
referências por uma mesclagem que preserva os defaults reais do Playwright e as
opções do projeto. Uma sondagem pela API pública obtém os argumentos e é fechada
em `finally` antes do navegador do worker; custo medido de 101–135 ms por worker.
Os 17 casos afetados, páginas longas/mobile e testes de configuração/limpeza
passaram (22 casos de navegador e quatro unitários). As 17 referências,
tolerâncias e controles da aplicação permaneceram intactos; não houve mudança
nas preferências do macOS. O procedimento está documentado em `verificacao.md`.

A revisão complementar e a nova execução completa do código final do M3 estão
em andamento.

Resultado final do M3: revisão complementar aprovada, sem achados; a execução
completa de `pnpm check` sobre o código final passou, incluindo **295 testes de
navegador**. As 17 referências da variação nativa permaneceram inalteradas; as
quatro referências editoriais já haviam sido inspecionadas e comparadas novamente
sem atualização. Produção continua sem escritas ou releases desta execução.

## 29/10/2026 — M4 em validação

A impressão e o parecer passam a identificar cada oferta pelo rótulo humano.
Os quadros de contagem mantêm os mesmos ledgers; etapas anuais ficam no ano
letivo e as semestrais são agrupadas por semestre, com numeração reiniciada em
cada ciclo. IDs, datas e vínculos persistidos permanecem intactos. Os cabeçalhos
HTML escapam rótulos e fundamentos; o parecer textual conserva o texto humano.
A página de regras explica as quantidades por ciclo e apresenta os fundamentos
dos mínimos anuais e semestrais, sem mudar os valores.

A revisão independente de conformidade aprovou o marco sem achados. Onze testes
direcionados de impressão/regras, typecheck e lint passaram. Dois testes locais
geraram PDFs reais no Chromium, a partir da fixture com quatro ofertas, nas
larguras desktop e mobile. As sete páginas renderizadas foram inspecionadas:
quadros legíveis, rótulos presentes, grupos anuais e semestrais corretos, sem
conteúdo cortado. Os PNGs das sete páginas são idênticos entre as duas larguras.

As duas referências de `/regras` mudam pela explicação dos ciclos e pelas fontes
dos mínimos. Imagens reais e diferenças foram inspecionadas em desktop/mobile,
incluindo recortes legíveis do início e final da página mobile. Não há texto ou
controles sobrepostos. A comparação sem atualização e `pnpm check` do código
final estão em andamento. Produção continua sem escritas desta execução.

A primeira validação completa parou por formatação do teste novo, corrigida.
A segunda encontrou uma regressão no teste já existente de três etapas legadas:
uma derivação exclusiva do v4 era chamada também no caminho antigo. A chamada
agora exige `state.offers`; o comportamento legado permanece intacto. O mesmo
teste passou após a correção, junto com os demais testes direcionados (14 casos).
As duas comparações de regras passaram sem atualização. A correção foi enviada
ao mesmo revisor para rechecagem pontual e a validação completa foi reiniciada.

A rechecagem aprovou o guard do caminho legado. A execução completa seguinte
aprovou as etapas rápidas e 296/297 testes de navegador em 209,2 s, mas o teste
de navegação pelo cabeçalho perdeu foco ao voltar pelo histórico. O fluxo
inalterado passou em 40/40 repetições isoladas; a investigação está medindo a
ordem dos callbacks de foco da rota. O marco segue aberto até resolver essa
falha e obter `pnpm check` aprovado, sem alterar interações ou tolerâncias.

A captura determinística comprovou a ordem: o título já conservava foco na volta;
depois do foco explícito no cabeçalho, o frame pendente da rota voltava ao título
e Shift+Tab alcançava o último link lateral. `WorkspaceLayout` agora compara o
foco com a origem capturada antes do frame. Se a pessoa já escolheu outro
controle, preserva esse foco e a rolagem. O reset natural para `body` quando o
controle de origem é ocultado/removido continua focando o título de chegada.
As quatro regressões, em desktop/mobile, falharam antes de suas correções e
passaram depois. O teste original permanece intacto e passou em 40/40 repetições
com quatro workers sobre o código final; navegação portal/Router passou com
27/27 casos. Não restam sondas ou tolerâncias alteradas. A correção pontual foi
encaminhada ao mesmo revisor; `pnpm check` final foi reiniciado.

A execução seguinte aprovou 300/301 testes, mas a regressão nova consultava o
reset de foco nativo com uma asserção imediata. A captura com servidor aquecido
mostrou o botão conectado sob `display: none` ainda ativo e, depois, `focusout`
para `body`, ambos com o relógio virtual parado no mesmo instante. O teste passa
a esperar estritamente essa mesma pré-condição com `expect.poll`, sem mudar
interações, relógio ou timeout. Retirando temporariamente a exceção `body`, a
regressão continuou falhando no foco final do título nas duas larguras; com a
fonte restaurada, os 27 casos passaram. A aplicação não mudou nesta rodada.

Resultado final do M4: revisão pontual aprovada sem achados; **`pnpm check`
aprovado em 207,6 s**, incluindo **592 testes unitários e 301 de navegador**.
As duas referências intencionais de regras passaram novamente sem atualização;
as demais referências permaneceram intactas. Nenhuma publicação foi realizada.

## 29/10/2026 — M5 e M6 em validação coordenada

O backend passa a criar, ler e salvar conteúdo v4; as tabelas aceitam v2/v3 e v4
durante a expansão. Os validadores legados de conteúdo e histórico foram
congelados em módulo independente e seu JSON foi comparado com o schema anterior,
sem diferenças. A entrada legada de salvamento existe somente para responder 409
e pedir atualização; nenhuma gravação nova usa esse formato. O histórico aceita
os dois contratos durante A. `offerKinds` é materializado nas operações sobre o
registro, sem persistir resumos de organização. O transporte aceita `null` para
limpar o Dia do Professor; o conteúdo persistido conserva somente ausência/data.

A migração expurga apenas as cinco tabelas previstas, converte conteúdos em
lotes de dez, preserva lixeira e metadados, mantém recibos substitutivos e
contadores próprios e registra auditorias do expurgo e de cada conversão com
hash anterior. Falhas de dados permanecem registradas e bloqueiam o status de
release; falhas transacionais conservam o cursor do componente. O reinício da
série retoma com segurança. O contador `pending` conta conteúdos com organização
a classificar, etapas ausentes em ofertas não excluídas ou ingresso desconhecido.
Órfãos e chaves sem destino são contados separadamente; sucesso do componente
não substitui a verificação independente do M7.

Os dois portões M5 aprovaram sem achados bloqueantes/importantes. A sugestão de
ordenar `offerKinds` pela ordem canônica foi aplicada e coberta pelo caso de v4
preexistente com pós-graduação antes de graduação. Validação dirigida: **131
testes Convex**, **nove de migração** e **49 de domínio**, além de typecheck Convex
e lint comum/com tipos. As regressões incluem três graduações independentes,
eventos institucionais para todos os ids do tipo, 409 sem escrita, limites e
rótulos, limpeza de data, etapas novas/alteradas fora do ciclo recusadas e
inconsistências migradas inalteradas preservadas ao salvar outra parte.

O cliente usa somente v4: formulários por identidade, criação com lista de ofertas,
metadados separados, etapas por ciclo e seleção de eventos por id. O caminho v2
do editor foi retirado junto da troca do seu contrato; os conversores continuam
apenas no backend/migração até B. Importação e cópia exportada usam formato 4;
cópias anteriores recebem a mensagem prevista. O filtro da URL valida a sintaxe
e confere a existência do id no calendário aberto, preservando o fallback de
filtros inválidos. A interface não conserva valores preenchidos fora dos hooks
compartilhados de formulário.

M5 e M6 estão sendo implementados e validados juntos porque o contrato inferido
do Convex atravessa o cliente. Os commits dos marcos serão separados, sem release
intermediária. A validação completa será feita sobre a combinação final, antes de
ambos os commits e da integração em `main`.

Validação parcial M6: **24 testes funcionais desktop/mobile** e **26 testes
dirigidos** passaram, incluindo criação com três rótulos, semestral com quatro
IDs e numeração reiniciada, escopo isolado, edição fora do ciclo e URL por id.
As quatro referências de períodos/etapas foram inspecionadas com seus diffs,
atualizadas e comparadas novamente sem atualização (4/4). Typecheck de aplicação
e testes passou. Portões M6 e demais fluxos de navegador estão em andamento.
Produção permanece sem escritas; o ensaio M7 ainda não foi executado.

Os portões M6 identificaram dois problemas importantes: a página de conferência
ainda consultava rótulos de tipos usando ids, produzindo `undefined`, e cancelar
uma oferta nova desmontava o formulário antes de limpar sua identidade suja na
sessão. Foram corrigidos com `labelFor`/`byOffer` e limpeza explícita da identidade
antes do descarte, sem alterar a preservação de rascunhos na navegação. Ambas as
regressões falharam em desktop/mobile antes da correção e passaram depois. Os
dois revisores aprovaram a rechecagem sem achados abertos.

Os testes existentes também detectaram que o seletor de sábados ainda consultava
a lista antiga, aceitando datas sem períodos no v4. Ele agora usa os ids de todas
as ofertas. As duas regressões de navegador passaram após a correção; sete testes
do modelo, incluindo a lacuna semestral e ausência do período de uma graduação
adicional, passaram. A navegação do portal foi ajustada para os dois campos de
identificação e para a lista de ofertas; os quatro casos passaram. As demais
correções dirigidas passaram em 24 casos.

A inspeção visual da criação detectou um botão esticado pelo layout herdado de
`fieldset`; o bloco novo passa a usar grid e controles com tamanho natural. As
quatro imagens reais e diferenças de criação/resumo foram inspecionadas em
desktop/mobile, incluindo recorte legível do final mobile, sem cortes ou
sobreposições. A confirmação da norma na fixture agora é feita para cada uma das
duas ofertas, preservando exatamente os totais e referências de 45/200 e 50/200.
Essas quatro referências foram atualizadas e comparadas novamente sem
atualização. Somadas às quatro de períodos, são oito referências intencionais.

Uma chamada de `pnpm exec` na cópia privada de preparação do M7 reconciliou por
engano o `node_modules` compartilhado. A execução foi interrompida, e
`pnpm install --frozen-lockfile` na raiz restaurou as dependências do lockfile,
sem downloads nem alteração de manifests/fontes. Intent continua disponível
(17 skills), os quatro projetos TypeScript e lint passaram após a restauração.
As verificações privadas seguintes usam somente binários Node diretos.

A primeira execução conjunta parou na formatação dos quatro contratos copiados
da preparação externa; foram formatados pela configuração da raiz. A execução
seguinte aprovou todas as etapas rápidas e 305/307 testes de navegador em 226 s.
O teste de importação ainda criava um período sem a associação obrigatória do
formato 4; passou a declarar explicitamente `a-classificar`, preservando o
cenário anterior de cópia ambígua e cancelamento. O caso completo passou novamente.
A diferença visual restante era somente a posição da barra lateral sticky: o
teste preenchia campos antes do foco/rolagem de chegada ao formulário. A captura
agora aguarda o título focado antes de começar a mesma interação, sem scroll
manual, máscaras ou tolerâncias. A comparação é repetida nas duas larguras.

O primeiro push real do schema A no backend local descartável revelou uma
restrição da plataforma que os tipos não detectam: módulos Convex não aceitam
hífens. Os três módulos novos foram renomeados para `legacyValidators`,
`migrationsReport` e `migrationsState`, com seus imports. A CLI 1.48.0 publicou
essas funções com typecheck em `anonymous-agent` e retornou sucesso em 1,2 s.
Esse backend está vazio; nenhuma migração, importação, seed ou escrita em
produção foi executada. A validação completa da combinação final será repetida
antes dos commits.

Resultado final conjunto M5/M6: **`pnpm check` aprovado em 223,5 s**, com todas
as etapas rápidas e **307 testes de navegador** aprovados. Os dois portões de
cada marco estão aprovados, sem bloqueantes/importantes abertos. A captura de
criação passou em seis repetições sem atualizar referências; o fluxo completo
de importação/cancelamento passou novamente. O schema A também foi aceito pela
CLI com typecheck no backend descartável.

Foi identificado um watcher Convex preexistente, iniciado antes desta execução,
com `.env.local` apontando para `dev:oceanic-gazelle-652`. Ele acompanha os fontes
e atualiza a API gerada; não é produção. Nenhuma suíte remota ou comando de dados
foi executado contra esse desenvolvimento. Os comandos desta execução de
publicação/verificação foram direcionados ao backend local descartável.
Produção continua sem backup, migração ou publicação desta execução.

## M7 — ensaio e verificação da release A (concluído)

O responsável informou que as sessões Convex/Vercel estão no perfil **Dentec**
do Google Chrome. A autenticação da CLI e o token da release continuam sendo o
caminho principal; o perfil fica disponível para renovação da sessão.

Foi exportado um backup integral de produção com Storage, somente leitura, em
diretório privado novo fora do Git. SHA-256:
`e7470a14131c5f8496081f0e6283a894268b67db9071d95c8ef2362f17bd4475`.
São 75 calendários/conteúdos, 1.575 versões, 1.575 snapshots, quatro pareceres,
12 versões de parecer, 61 aliases e um arquivo no Storage. A projeção anterior
foi calculada pelo código arquivado do `main` original (`34e35b9`), com verificação
dos blobs e do oráculo congelado. Digest da projeção:
`ef8cf03247173841e77ecb89229bb06fea1db551faea8bf918fb8065f22798c0`.

O inventário anterior contém 59 conteúdos v2, nenhum órfão ou chave sem destino,
40 calendários sem etapas definidas e nenhuma combinação semestral com três
etapas. Não há calendário até 2026 nem registros de tipo diferente de `event`;
há vínculos de requisitos legados de 2027, que dependem da confirmação da
consulta em produção depois da migração para decidir a limpeza do M9.

O verificador próprio compara o mapeamento integral, domínio, namespaces,
registros de tabelas, bytes do Storage, expurgo, auditoria e recibos. Uma revisão
independente detectou duas omissões importantes: comparar só nomes do registro
de tabelas e descartar nomes/termos de todos os requisitos. A correção compara
os registros completos e conserva nomes/termos, transformando apenas os quatro
nomes de famílias de etapas previstos. O mesmo revisor aprovou a correção;
71 testes do verificador e sete da consulta `legacy:usage` passaram, assim como
os quatro projetos TypeScript. Isso ainda não substitui o ensaio real.

A primeira restauração local foi recusada atomicamente por conflito de número
interno de tabela: o schema A publicado no banco vazio havia atribuído a
`migrationReports` o número de `migrationState` no backup. O ensaio será repetido
em instância local nova, importando o backup antes de publicar A, na ordem do
plano. Nenhuma escrita em produção ocorreu. O backup imediatamente anterior à
release A e sua prova de restauração ainda serão conferidos antes da publicação.

A segunda restauração, antes de qualquer push, foi aprovada: 62 namespaces,
5.643 linhas incluindo metadados, seis registros de tabelas e um arquivo no
Storage. As 114 entradas descompactadas são idênticas byte a byte. Depois disso,
o schema A foi aceito com typecheck; as nove migrações e o relatório concluíram
com sucesso, convertendo 75 conteúdos e expurgando as quantidades previstas.
O `pnpm check` do código M7 inicial passou em **224,1 s**, incluindo os **307
testes de navegador**. A correção da prova abaixo exigirá nova validação afetada.

O portão formal de conformidade detectou uma lacuna importante: o baseline de
prontidão usava pareceres vazios nos dois lados. O expurgo está autorizado, mas
dois dos quatro pareceres antigos têm norma preenchida, mesmo desatualizados;
apagá-los acrescenta uma pendência. O painel independente (dois subagentes e
Codex CLI somente leitura) aprovou **3/3** o esclarecimento na §6.4: conservar
prontidão real e prontidão após exclusivamente o expurgo, com delta completo,
comparando a conversão com a segunda. Esse voto não concede go de produção.
A correção e sua regressão estão em preparação; os recibos originais permanecem.

O primeiro verificador executado contra o backup realmente migrado também
bloqueou a publicação: 14 calendários possuem organização a classificar, mas
quantidade antiga de etapas definida. O domínio anterior ainda gera requisitos
dessas etapas; a conversão atual descarta essa quantidade e perde as linhas.
Esse é um problema da aplicação/modelo a corrigir, sem relaxar a comparação.
O ensaio ainda não foi aprovado e produção permanece sem escritas.

O diagnóstico independente detalhou a perda: 26 ofertas com organização a
classificar (11 com duas, quatro com três e 11 com quatro etapas) deixariam de
gerar 312 linhas, 78 de cada família. O painel de modelo aprovou **3/3** a
preservação em `legacyStageCount`, sem inferir organização nem ciclo. A §3.4 e
a lista do M9 foram atualizadas no mesmo marco. A implementação precisa manter
os nomes, obrigações e cronologia anteriores, proteger a transição no backend,
conservar o impedimento de organização e a validação de novas datas, e medir
uso também nos snapshots históricos. Esse voto também não autoriza produção.
Os 61 demais calendários passaram na comparação de domínio preliminar; os 14
continuam bloqueados até a correção e a repetição do ensaio desde o backup.

A representação preservadora foi implementada e comparada com a fonte original.
Os três novos casos 2/3/4 foram congelados antes da correção no caminho v3 e
conferidos independentemente com `34e35b9`: requisitos completos e prontidão
idênticos em todos. Nenhum valor esperado foi regenerado após a correção.
O novo campo é preservado em leitura, cópia4 e salvamentos de outras partes;
classificações parciais por períodos são recusadas até a configuração completa.
Seu uso é contado também nos snapshots históricos, com distribuição 2/3/4.

A restauração dos requisitos revelou outro defeito: a validação v4 suprimia o
diagnóstico antigo de etapa fora de período quando a organização era pendente.
O diagnóstico foi restabelecido; somente a normalização preservadora desses
registros usa uma opção interna restrita, enquanto editar/criar datas continua
exigindo ciclo válido no comando e no backend. O preview de configuração também
passou a considerar organização e quantidade juntas, conservando resultados,
conselhos e reuniões vinculados. Ambas as regressões falharam antes da correção.

O portão Convex encontrou uma salvaguarda adicional: a retirada do marcador
comparava a proposta com ela mesma, pulando exigências anteriores de ingresso e
editais. Agora a transição usa o estado anterior autoritativo e o draft completo
do candidato. A regressão HTTP reproduziu a aceitação indevida e passou depois;
o mesmo revisor confirmou a rejeição mesmo se o candidato omitir a matrícula ou
o edital anteriores. Os dois achados formais M7 estão resolvidos, sem importantes
abertos. A revisão da prontidão confirmou exatamente os dois deltas previstos.

A prova de domínio sobre os dados reais passou em **75/75 calendários**: 20
contagens calculadas e 55 pendências com evidência independente; as 26 ofertas
mantêm suas quantidades e os 312 requisitos. Passaram 99 testes do verificador,
as regressões de domínio/backend e seis novos casos de navegador desktop/mobile.
A execução completa definitiva **`pnpm check` passou em 227,2 s, com 313 testes
de navegador**. Uma execução intermediária foi interrompida com código 130 para
incorporar os defeitos encontrados pela prova real; ela não conta como aprovação.

O replay do backup inicial, já com quase uma hora, foi recusado pelo verificador
porque o cron normal de autenticação retirou uma sessão expirada e seus dez
refresh tokens. Nenhuma tolerância foi adicionada. Foi gerado backup integral
novo de produção, SHA-256
`3b4217402feccdd2cb24587b326c951a10d605ad925f6d1430539b3a6c3d52d3`,
com projeção independente
`f5449fd5389ef0e35cef00c5d37cb5434cf1ddd084d0ee693660de7ae87a1028`.
O estado operacional continua livre, sem emergência nem pausa. O ensaio final
usa esse backup fresco em uma instância local nova, antes de qualquer escrita
em produção.

O ensaio B revelou uma diferença de representação e uma falha real de escopo.
O verificador agora canoniza `offerId` para o nome histórico da projeção somente
nas coleções definidas e recusa conflitos, ausência ou troca de identidade;
os campos extras continuam comparados. A projeção A não mudou. No produto B,
73 snapshots institucionais antigos ainda declaram tipos normativos sem ids de
ofertas; seu filtro passa por `offer.kind` exclusivamente quando
`institutional === true`, com prioridade dos ids explícitos. Registros locais
continuam somente v4. As duas contagens de pós-graduação que divergiam voltaram
a coincidir; os 20 ledgers calculados são idênticos.

O verificador integral aprovou A e B em 75/75 calendários, com o mesmo hash de
projeção `87f50e1dd5e17073d644386de408fed9c106ad3b788ea4787a6483886d89639c`.
Passaram 116 testes das ferramentas; B teve 48 testes dirigidos, quatro projetos
TypeScript e lints verdes. Após a última mudança da ferramenta, **`pnpm check`
passou em 225,9 s, incluindo 313 testes de navegador**. Nenhum código funcional
foi alterado depois dessa execução.

Para aproximar o backup da publicação, a preimagem integral foi renovada:
SHA-256 `911c0b3f2a68d9901af40e2b2bb2a59b5da17cf66f9c5e79e6062fc0310f9321`,
fonte congelada
`673412d4dc0bc8dab2457fb893777d36324ca6e97b9b5820d144dc7a03df693a`.
A restauração em instância local nova preservou as 114 entradas, 62 namespaces,
5.673 linhas, seis registros de tabelas e um arquivo do Storage. O mesmo código
A/B está repetindo o ensaio sobre essa preimagem. Os dois julgadores de produção
concluíram a pré-análise sem importantes/bloqueantes; aguardam os recibos finais
e o SHA para emitir o voto único. A publicação ainda está bloqueada até o go
unânime dos três julgadores.

O painel de produção aprovou **3/3** o commit `f5cfcb6` da release A. A primeira
execução publicou o backend e iniciou as migrações, mas o coordenador da release
interpretou como erro os passos ainda não iniciados de `runSerially`. O frontend
não foi promovido. As nove migrações terminaram, e a verificação independente
em produção aprovou integralmente os dados antes da recuperação. A reserva foi
conferida pelo proprietário exato e liberada com `force-with-lease`, conforme o
guia operacional; o mesmo commit foi publicado novamente pelo comando oficial.

**M7 concluído em produção.** A release A foi promovida e verificada novamente:
75 calendários, 20 contagens calculadas e 55 pendências comprovadas, sem órfãos,
chaves perdidas, combinações semestrais com três etapas ou avisos novos. Foram
convertidos 59 conteúdos v2 e 16 v3, incluindo 35 calendários na lixeira. O
expurgo retirou 12 versões de parecer, quatro pareceres, 1.591 versões, 1.591
snapshots e 61 aliases; as 76 auditorias previstas e nove recibos do componente
foram conferidos. Demais tabelas e Storage foram preservados. A preimagem
automática imediatamente anterior ao backend tem SHA-256
`696d00b018899e4912245d97df4949f0966c43da630ee21d47b06e904f694829`.
O domínio canônico serve `f5cfcb6`, deployment `dpl_J7oZphPBoB6xv5sax9zGW8vfSGkN`.

A consulta `legacy:usage` foi executada integralmente em produção. Não há
calendários até 2026, decisões antigas de ingresso nem registros não `event`,
inclusive nos snapshots históricos. Permanecem 26 quantidades antigas em 14
calendários e 59 eventos com vínculos legados de 2027: ambos devem ficar no M9.
Foi identificado um campus residual e seu calendário 8700, sem usuários ligados.
A página de regras foi conferida no Chrome do perfil Dentec, com a sessão do
portal aberta: conjunto v3 editorial, etapas por ciclo e mínimos 200/100 visíveis.

## M8 — estreitamento para formato 4 (concluído)

O candidato B remove os validadores, conversores e adaptações locais v2/v3;
conteúdos e históricos exigem v4, `offerKinds` é obrigatório e `pending` vazio.
Os hashes publicados das regras e o oráculo original permanecem intactos.
As entradas v4 de equivalência foram capturadas pela fonte A antes da retirada
dos conversores; catálogos v4 e históricos são comparados com capturas estáticas
da mesma fonte. Nenhuma expectativa foi produzida por B.

A coordenação da release tratava como terminal o estado `unknown` de etapas
posteriores, mesmo com execução ainda ativa. Quatro regressões reproduziram a
rejeição antecipada. Após a correção mínima, oito testes do coordenador e 27
testes simulados de deploy passaram; o teste principal exige quatro leituras e
três esperas antes de todos os estados serem `success`. Falhas, cancelamentos,
ausência real de execução e timeout continuam bloqueando a promoção.

A mutação temporária do resíduo foi preparada para publicação em B, conforme
a sequência registrada no plano. Passaram 21 testes e uma simulação real no
backend local: uma exclusão planejada em cada tabela alvo, zero gravações,
nenhuma auditoria criada e todos os registros/recibos idênticos antes/depois.
Ela será usada e retirada somente no M9, após as conferências em produção.
O `pnpm check` de B e seu portão de conformidade estão em andamento.

O `pnpm check` de B passou em **229,3 s**, com **313 testes de navegador** e todas
as etapas rápidas aprovadas. O portão de conformidade terminou sem importantes
ou bloqueantes. A única sugestão foi esclarecer a proveniência dos inputs v4:
foram capturados com o conversor do commit `746d308` (SHA-256 `e124b04…`, também
presente em `3517d11`), antes da preservação adicional do M7. O revisor comparou
os 18 inputs congelados com o conversor A final (`f5cfcb6`, SHA-256 `f80fae9…`)
e confirmou zero diferenças. A fixture e seus hashes originais foram mantidos
integralmente; a origem fica esclarecida neste diário.

Os dois julgadores de B concluíram a pré-análise sem importantes/bloqueantes.
O voto final e a publicação aguardam o SHA do marco e a unanimidade do painel.

**M8 concluído em produção.** O painel aprovou **3/3** o commit `161fb295`,
incluindo a preparação temporária de M9. A release oficial aceitou o schema
estrito, confirmou ausência de migrações pendentes e promoveu o deployment
`dpl_5ikSR9NzfACTyBkQwW3cwiYHkq5w`. O Storage e todas as tabelas da aplicação
permaneceram idênticos ao backup imediatamente anterior; somente dois
namespaces de presença seguiram seu ciclo normal, com prova independente do
runtime fixado. Os runtimes A e B produziram a mesma projeção dos 75 calendários
da exportação efetiva de produção.

## M9 — retirada dos legados sem uso (concluído)

O inventário real permite retirar a política de 2026 e sua decisão operacional,
os tipos de registro sem uso, aliases e ferramentas v1/v2 com comandos,
dependências e testes exclusivos. Permanecem as 26 quantidades antigas em 14
calendários, seus inventários correntes/históricos e 59 vínculos de requisitos
legados de 2027. O oráculo e os fingerprints publicados não são regravados.
O verificador M7 e a correção permanente da coordenação continuam disponíveis.

O candidato C foi preparado com o executor e sua API já ausentes; a função
implantada em B continua disponível somente até a publicação de C. O painel
de M9 autoriza a operação por IDs/versão e a publicação desse estado final,
depois da simulação e do backup. Nenhuma exclusão foi feita em produção até
esta etapa. A simulação efetiva no backend B planejou um conteúdo, um calendário
e um campus, retornou zero exclusões e `auditId: null`.

No ensaio descartável, a execução removeu exatamente esses três registros e
acrescentou uma auditoria `PURGE_RELEASE_RESIDUE`; repetir a chamada retornou o
mesmo recibo sem alterações. Dos 64 namespaces, somente `calendarContents`,
`calendars`, `campuses` e `audit` tiveram as alterações previstas; os demais
60 e o Storage permaneceram idênticos. O schema C foi aceito, o executor deixou de existir e as exportações
após o expurgo e após o deploy C foram byte a byte idênticas. Os runtimes B/C
produziram a mesma projeção dos 74 calendários restantes, digest
`239a034d88ea0ec21401ed985cd165010257eb838e9d5de0e0ad99d574745502`.

A preparação visual passou em 29 fluxos, dois casos de impressão com fatos
anteriores e quatro comparações visuais. Três referências darwin mudaram pela
retirada intencional do seletor de tipo de registro e foram inspecionadas e
comparadas novamente. O rebase sobre o escopo institucional corrigido em B
passou em 223 testes de domínio e nos quatro projetos TypeScript; a suíte
completa no workspace principal é a validação definitiva.

A primeira execução completa parou antes do navegador: três testes do
verificador ainda pediam a política de 2026 no runtime atual. Como seu uso
real é zero e a política foi retirada, os dois inputs originais de 2026 agora
comprovam a rejeição explícita pelo runtime C, sem trocar anos ou esperados.
A prova histórica do parecer usa diretamente a fonte congelada e preserva
seus deltas. Os 116 testes do verificador passaram; fonte, oráculo e algoritmo
de verificação não mudaram. Uma nova execução completa está em andamento.

A execução definitiva de C passou em **239,6 s**, com **311 testes de navegador**
e todas as etapas rápidas aprovadas. Antes da exclusão real foi exportado outro
backup v4 integral com Storage, SHA-256
`87c184568b65143bb50aba79809e137d901c6d3a0299065a0f94207ee940b5ab`.
A restauração em backend vazio conferiu 118 entradas, 64 namespaces, 2.575 linhas,
seis registros de tabelas e um arquivo do Storage, todos idênticos. O inventário
real foi repetido e confirmou as mesmas condições de retirada. A chamada
`dryRun` foi comprovada inclusive a partir do checkout C preparado, usando a
função ainda implantada em B, sem introduzir o executor no código final.
O portão e o painel de M9 avaliarão a exclusão estrita por IDs/versão e a release
desse mesmo estado final, antes de qualquer exclusão em produção.

O portão formal de M9 terminou sem bloqueantes ou importantes. As sugestões
editoriais foram aplicadas: 64 namespaces totais, dos quais 60 intactos, e título
de teste sem a referência a uma política já retirada. Os exports e tipos da
versão instalada de `@tanstack/react-form` (1.33.5) foram conferidos novamente,
assim como os guias oficiais de
[composição](https://tanstack.com/form/latest/docs/framework/react/guides/form-composition)
e [valores assíncronos](https://tanstack.com/form/latest/docs/framework/react/guides/async-initial-values).
A retirada do seletor conserva o hook compartilhado, a identidade do formulário
e o contrato de valores carregados. Após a suíte completa, só documentação e o
título desse teste foram alterados; suas asserções e código funcional não mudaram.

**M9 concluído em produção.** O painel independente aprovou **3/3** a exclusão
estrita do resíduo e a release C, commit `0bd3756b`. A conferência imediatamente
anterior repetiu o inventário e a simulação por IDs e versão. A execução removeu
exatamente um conteúdo, um calendário técnico 8700 e seu campus sem usuários,
com uma auditoria `PURGE_RELEASE_RESIDUE`. A exportação posterior confirmou esse
delta, os demais documentos e o Storage; as únicas diferenças adicionais foram
o ciclo de presença, reconciliado contra o runtime instalado.

A release oficial `pnpm deploy:production` aceitou o schema, confirmou `pending`
vazio e promoveu `dpl_7phX2z6WQD1psHeTKMZnsCmAnEjy`. A referência de reserva foi
liberada. O inventário de funções confirma a ausência do executor temporário.
O portal foi conferido em leitura no Chrome Dentec: regras por oferta, etapas
por ciclo, mínimos 200/100 e histórico editorial v3 visíveis. Não houve E2E de
escrita em produção.

A comparação mais ampla entre o expurgo e o pós-release detectou uma rotação de
autenticação durante a construção do candidato: um token de renovação foi
marcado como usado e seu filho foi criado. A conferência independente do código
instalado e dos três snapshots comprovou que a rotação já estava inteira no
backup automático **anterior ao backend C**. Esse backup, SHA-256
`93dee27f01b82a62c654ebb9547a8d6e9dedd1e5506661974837c78430328d9d`, e o
pós-release têm todas as tabelas da aplicação e Storage idênticos. Só dois
namespaces de presença mudaram dentro do contrato conferido. A comparação
estrita original continua recusando a diferença de autenticação; nenhuma
permissão genérica para ignorá-la foi acrescentada ao verificador.

As provas privadas de C, incluindo restauração, simulações, recibo, inventários,
delta do expurgo, projeções B/C e ciclo de autenticação, ficam em
`/Users/gustavo/work/ofertas-v4-operacao-20261029T185409Z/production-c/`.
O backup automático anterior ao backend fica em
`/Users/gustavo/work/backups-calendario/release-0bd3756b-bgfpeE/`.
Os backups integrais e dados dos ensaios são preservados fora do Git.

## Relatório final — 29/10/2026

- **Produção:** releases A, B e C concluídas pelo fluxo oficial, cada uma com go
  unânime. O portal serve o código C `0bd3756b`; a última validação confirma schema
  estrito v4, nenhuma migração pendente, nenhuma manutenção ou operação ativa e
  executor temporário ausente. O commit posterior deste relatório só documenta
  o encerramento, sem alterar o código publicado.
- **Dados:** a migração converteu 75 conteúdos (59 v2 e 16 v3), incluindo 35 na
  lixeira, com 20 contagens calculadas e 55 pendências comprovadas. A retirada do
  resíduo deixa **74 calendários**, os mesmos 35 na lixeira, 20 contagens
  calculadas e 54 pendências. Não houve órfãos, chaves perdidas ou avisos novos;
  a limpeza técnica não modificou calendários de uso real.
- **Expurgo de A:** 12 versões de parecer, quatro pareceres, 1.591 versões,
  1.591 snapshots e 61 aliases; 76 auditorias e nove recibos de migração
  conferidos. M9 acrescentou apenas a exclusão técnica descrita acima e sua
  auditoria. Arquivos do Storage e demais dados foram preservados.
- **Legados retirados:** formatos v2/v3 e conversores em execução, política de
  2026 e sua decisão antiga, tipos de registro especiais sem uso, aliases,
  ferramentas v1/v2 e comandos/dependências/testes exclusivos. A ferramenta
  específica da exclusão foi retirada no próprio M9.
- **Legados mantidos por uso real:** `legacyStageCount` em 26 ofertas de 14
  calendários conserva as quantidades conhecidas sem inventar organização ou
  ciclo. Os requisitos antigos de 2027 permanecem porque 59 eventos ainda os
  referenciam. Nenhuma dessas pendências foi silenciosamente resolvida pela
  migração. Oráculo, capturas independentes e fingerprints publicados foram
  preservados.
- **Validação:** `pnpm check` definitivo aprovado em **239,6 s**, incluindo
  **311 testes de navegador** no macOS, desktop/mobile e impressão Chromium,
  além de tipos, lint, build e testes rápidos. Os 116 testes do verificador
  passaram; coordenação e deploy tiveram 35 testes dirigidos/simulados; o
  executor temporário teve 21 testes antes da retirada. O ensaio local de M9
  comprovou o delta exato e a idempotência; a restauração integral comprovou
  todos os bytes, incluindo Storage. A comparação B/C sobre o snapshot real
  final confirmou as mesmas projeções dos 74 calendários.
- **Limites e pendências:** não há trabalho funcional ou publicação pendente.
  A suíte de escrita remota não foi executada em produção, conforme a regra do
  projeto; as operações autorizadas foram ensaiadas em backends descartáveis.
  Fica registrada abaixo uma sugestão menor de organização dos imports de
  testes, sem efeito no runtime ou nos dados.

## Standards

Revisão independente do diff completo `34e35b9…0bd3756`, em contexto limpo.
Zero achados bloqueantes ou importantes.

**Sugestão — violação documentada:**
`src/domain/calendar/normalization/normalize.ts:1` tornou-se uma fachada que
apenas reexporta `normalizeOfferCalendar` como `normalizeCalendar`. Contraria
`docs/arquitetura-convex.md:14`: “Imports apontam ao módulo responsável, sem
fachadas de reexport”. Os consumidores restantes são testes, como
`test/domain/editor-import.test.ts:3`. Remover a fachada e atualizar esses
imports elimina esse ponto de entrada intermediário. A sugestão fica
registrada; não altera o comportamento publicado nem mantém leitura de
formatos antigos.

## Spec

Revisão independente do mesmo diff completo, em contexto limpo. Zero achados
bloqueantes, importantes ou sugestões, considerando as emendas aprovadas no
plano.

**Resultado por eixo:** Standards: um achado, de sugestão; Spec: zero achados.
Nenhum bloqueante ou importante aberto em qualquer eixo.
