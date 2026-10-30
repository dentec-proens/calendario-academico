# Observâncias nas policies do calendário

Data: 30/10/2026.

Status: implementado e publicado em produção em 30/10/2026, com migração concluída e manutenção encerrada. Ver [registro da execução](2026-10-30-observancias-execucao.md).

## Objetivo e decisões de escopo

Declarar nas policies anuais as regras de observância do Dia do Professor e do Dia do Servidor Público, substituindo a exceção específica do Professor por um mecanismo compartilhado.

Para 2027, ficam definidas as seguintes possibilidades:

| Observância             | Datas permitidas                         | Data institucional atual |
| ----------------------- | ---------------------------------------- | ------------------------ |
| Dia do Professor        | 11 a 17/10/2027, inclusive fim de semana | 15/10/2027               |
| Dia do Servidor Público | Somente 28/10/2027 e 29/10/2027          | 28/10/2027               |

A regra do Professor conserva o comportamento atual, inclusive a possibilidade de sobreposição com o recesso de 11/10, o feriado de 12/10 e o fim de semana de 16 e 17/10. A regra do Servidor não permite os dias 25 a 27/10 nem 01 ou 02/11.

Cada escolha vale somente para o calendário em edição. Não será criada uma preferência global que altere automaticamente todos os calendários do campus.

Os recessos de 29/10 e 01/11 e Finados em 02/11 permanecem no catálogo. Ao transferir a observância do Servidor para 29/10, o dia 28 volta a ser potencialmente letivo, sujeito aos demais impedimentos, períodos e configuração da semana letiva. A sobreposição de dois impedimentos em 29/10 não desconta dois dias.

## Avaliação independente e alternativa adotada

O plano foi avaliado pelo Claude Code CLI em modo de planejamento, com ferramentas somente de leitura. A avaliação foi concluída sem implementação, testes ou operações remotas.

A proposta inicial mantinha o mecanismo em `src/domain/institution/` e declarava a referência/padrão junto às permissões da policy. A alternativa do Claude separa as responsabilidades: a policy declara as possibilidades, o catálogo publicado fornece a data institucional e o calendário guarda a escolha local. O mecanismo fica na camada de calendário.

A alternativa é a base deste plano, com os seguintes ajustes consolidados:

- Preservar a diferença entre selecionar explicitamente uma data e restaurar a referência institucional. Selecionar a data atual da base não deve remover automaticamente a escolha.
- Manter acessíveis calendários com escolhas inválidas ou órfãs, sem trocar ou descartar datas silenciosamente.
- Preservar o significado dos snapshots históricos, sem revalidá-los pela policy atual.
- Fazer a migração numa única janela de manutenção. Por decisão do responsável pelo projeto, não serão criados protocolos específicos de proteção contra gravações de abas antigas nem adaptadores de coexistência de clientes.

## Fontes da verdade

| Informação                                   | Responsável                             |
| -------------------------------------------- | --------------------------------------- |
| Evento ajustável e datas permitidas          | Policy do ano                           |
| Fundamento e origem da flexibilização        | Policy e histórico de alterações        |
| Data institucional de referência             | Evento no catálogo publicado            |
| Escolha do campus para aquele calendário     | Estado persistido do calendário         |
| Datas efetivamente usadas no estado aplicado | Mecanismo compartilhado de observâncias |
| Datas de uma versão histórica                | Snapshot gravado daquela versão         |

A policy não duplica a data padrão do catálogo. Na base atual, 15/10 e 28/10 continuam sendo as referências do Professor e do Servidor, respectivamente. A alteração de uma referência publicada deve respeitar as opções permitidas pela policy.

O fundamento da flexibilização deve registrar a decisão de gestão que a introduziu, distinguindo-a da norma que originou o evento. Não atribuir à resolução uma permissão que tenha sido definida separadamente pela gestão.

## Organização das policies

Dividir o módulo atual `src/domain/policies/consup-292-2027.ts` numa pasta anual, com os seguintes papéis:

```text
src/domain/policies/
  contract.ts
  registry.ts
  unconfigured.ts
  consup-292-2027/
    index.ts
    requirements.ts
    criteria.ts
    history.ts
    observances.ts
```

`index.ts` compõe a `CalendarPolicy`. O registry continua sendo a entrada de seleção por ano; consumidores não importam diretamente a policy concreta.

As observâncias são declarações tipadas simples: chave estável, código do evento institucional, nome, datas permitidas e fundamento. Para estes dois casos, uma lista explícita de datas é suficiente. As datas de 2027 ficam na declaração anual, sem condições específicas do ano no formulário, na contagem ou no servidor.

Atualizar o teste de arquitetura para permitir composição interna no mesmo módulo anual, preservando a restrição de acesso externo pelo registry e a proibição de ciclos de imports em runtime. As declarações de observância não devem importar seu mecanismo de aplicação.

Policies continuam sendo código TypeScript versionado no repositório. A página `/regras` deverá apresentar também as observâncias, com datas permitidas e fundamento, a partir da mesma declaração usada pela aplicação.

Em anos sem policy configurada, não haverá observâncias ajustáveis. A presença de uma policy anual também não basta para disponibilizar uma escolha: o evento correspondente precisa estar presente na base aplicável às ofertas daquele calendário. Um calendário somente de pós-graduação em 2027, que não herda esses eventos, não recebe essas opções.

## Estado e mecanismo compartilhado

Substituir `teacherDayDate` por um mapa opcional de escolhas:

```ts
observanceDates: {
  'teacher-day': '2027-10-13',
  'public-servant-day': '2027-10-29',
}
```

As chaves são identidades semânticas estáveis. A policy anual faz o vínculo com os códigos existentes do catálogo.

Regras do estado:

- Ausência da chave significa seguir a referência institucional.
- Selecionar uma data grava uma escolha explícita, inclusive quando ela coincide com a referência atual.
- “Restaurar data institucional” remove a chave.
- Escolhas inválidas ou desconhecidas não são descartadas silenciosamente.
- A remoção de uma escolha deve ser possível mesmo se o evento ou a regra já não estiver disponível.

Criar o mecanismo compartilhado em `src/domain/calendar/observances.ts`, substituindo `src/domain/institution/teacher-day.ts`. Sua interface deve concentrar resolução das opções, validação da escolha e projeção dos eventos com as datas efetivas.

`inheritedEvents` passa a selecionar e projetar os eventos institucionais aplicáveis, sem aplicar estado local do campus. A aplicação das observâncias será compartilhada pelos caminhos de recálculo, preparação do salvamento, comparação/incorporação da base e projeção do editor.

A projeção deve ser pura e idempotente, conservando `originalStart` e `originalEnd`. Reaplicá-la não pode acumular deslocamentos nem perder a referência institucional. A comparação da base continua distinguindo conteúdo institucional de escolha local.

Preservar todos os IDs existentes. No catálogo inicial, substituir os IDs gerados por posição por valores explícitos iguais aos atuais; em particular, conservar `ifpr2027-16` para o Professor e `ifpr2027-17` para o Servidor. Não renumerar eventos nem substituir dados publicados automaticamente.

## Leitura, conflitos e gravação

A leitura precisa tolerar escolhas que tenham se tornado incompatíveis com a base ou com uma policy posterior. A consulta do calendário e do histórico não deve falhar por esse motivo.

Exibir um diagnóstico quando a escolha for inválida, o evento tiver sido desativado/removido ou a referência publicada estiver incompatível com a policy. Preservar os dados registrados e a projeção confirmada necessária à consulta; não adotar automaticamente outra data ao encontrar um conflito.

Novas escolhas inválidas são recusadas pelo domínio também no servidor. A confirmação do calendário exige a resolução dos conflitos de observância. O caminho de resolução deve oferecer limpar/restaurar a escolha independentemente da existência do evento na lista.

Snapshots históricos usam os eventos e datas gravados naquela versão. `rulesetVersion` identifica a regra vinculada ao estado, mas o registry atual não fornece um runtime de todas as versões anteriores; o plano não pressupõe essa capacidade.

Proteger a edição administrativa dos eventos referenciados por observâncias: recusar datas fora das opções, intervalos com mais de um dia e mudanças de ano incompatíveis com o vínculo. A checagem deve considerar o evento anterior e o proposto, evitando que uma troca de ano contorne a regra. A eventual desativação do evento precisa continuar permitindo diagnosticar e limpar escolhas órfãs.

## Formulário e fluxo do editor

Substituir o formulário e o painel exclusivos do Professor por um formulário genérico de observância. A lista de opções vem da policy; um controle de seleção ou grupo de rádios pode apresentar exatamente as datas permitidas, identificando a referência institucional.

Usar o hook compartilhado de formulários, com identidade de rascunho por observância. Preservar aplicação, descarte, fechamento, restauração, permissões e confirmação de gravação pelo Convex. Durante a implementação, consultar os exports e tipos instalados de TanStack Form e as referências oficiais de composição e valores assíncronos exigidas pelo `AGENTS.md`.

Generalizar os casos específicos em `EventsSection`, `CampusEventList`, `EventPanel` e `EventEditorProvider`. Oferecer resolução de conflitos sem depender exclusivamente de um evento ainda presente na lista.

O recálculo deve alcançar tanto a contagem quanto os períodos definidos por quantidade de dias letivos. Se a escolha alterar términos calculados, apresentar o efeito no editor. Prévia, impressão e PDF devem usar as mesmas datas efetivas do calendário.

Cópias JSON antigas que contenham `teacherDayDate` devem ser recusadas explicitamente na importação, com mensagem clara. A migração do banco não alcança arquivos exportados; o leitor não pode simplesmente ignorar o campo antigo e perder a escolha.

## Versionamento das regras e pareceres

Acrescentar a próxima versão ao histórico da policy de 2027. No estado analisado, a próxima versão seria `consup-292-2027-v4`; conferir o histórico novamente na implementação.

Classificar a alteração como `relaxes`: o Servidor ganha uma opção e o Professor mantém suas possibilidades. A atualização da policy, por si só, não deve invalidar pareceres existentes.

Uma mudança efetiva de data pelo campus usa o salvamento normal, avança a versão do calendário e torna o parecer anterior desatualizado conforme as regras existentes. Isso é separado da equivalência entre versões da policy.

Adicionar uma verificação própria de integridade das observâncias no histórico de regras. Os fingerprints e fixtures já publicados para requisitos devem continuar intactos; não reescrever referências históricas para acomodar o novo conteúdo.

## Migração numa única janela de manutenção

O responsável pelo projeto autorizou planejar uma breve manutenção para a migração, considerando o baixo volume de usuários e dados e a fase de testes. Este documento não representa execução nem pedido atual de deploy.

Consultar [Implantação e operação](../implantacao-convex-vercel.md) antes da publicação. Preparar a migração em `convex/migrations.ts`, com schema ampliado na primeira release e estreitado na segunda, dentro da mesma manutenção:

1. Inventariar os campos antigos em conteúdos atuais e snapshots históricos, incluindo calendários na lixeira e eventuais inconsistências. Preparar o ensaio e as provas de preservação.
2. Ativar manutenção com bloqueio de gravações e obter backup integral com Storage, conforme o procedimento de operação.
3. Publicar o schema ampliado, aceitando temporariamente `teacherDayDate` e `observanceDates`, com as migrações em `pending`.
4. Converter `calendarContents.state` e `calendarSnapshots.state`. Mapear a escolha antiga para `observanceDates['teacher-day']`, sem criar uma escolha do Servidor onde não existia.
5. Conferir o resultado e a ausência do campo antigo em todos os documentos abrangidos.
6. Publicar o schema estreitado, remover os artefatos temporários desnecessários e verificar a aplicação.
7. Encerrar a manutenção após a conferência final.

A migração será somente de representação: preservar versões dos calendários, `updatedAt`, revisão da base, `rulesetVersion`, vínculos com pareceres, datas dos eventos e snapshots institucionais. Não arquivar versões novas nem recalcular períodos ou históricos apenas por causa da conversão de campo.

Preservar também escolhas explícitas que coincidam com a referência institucional. Valores inesperados devem ser inventariados e tratados explicitamente, sem descarte ou normalização silenciosa. Se os campos antigo e novo coexistirem com escolhas divergentes, a migração deve apontar o conflito em vez de escolher um deles automaticamente. A conversão deve ser idempotente.

Atualizar as ferramentas administrativas de projeção e verificação que dependam do campo ou do módulo antigo. Referências a código histórico usadas por verificadores independentes precisam continuar resolvendo as revisões correspondentes.

Não criar proteção específica para abas antigas, nova versão de protocolo apenas para esse fim ou adaptadores de coexistência na aplicação. O schema ampliado é uma etapa temporária de armazenamento para a migração dentro da manutenção.

## Sequência de implementação

1. Reorganizar a policy anual e declarar as observâncias, preservando o comportamento do Professor. Atualizar as restrições de imports e a estabilidade dos IDs.
2. Implementar o mecanismo puro e o mapa de escolhas, com validação, projeção, conflitos e integração com base, recálculo e preparação de salvamento.
3. Generalizar formulário e painel, acrescentar o Servidor, apresentar observâncias em `/regras` e proteger a edição administrativa dos eventos vinculados.
4. Acrescentar o histórico de flexibilização e a verificação de integridade das observâncias, mantendo as referências publicadas.
5. Preparar e ensaiar a migração de representação, atualizar verificadores e documentar a execução em [Operações administrativas de dados](../migracao-schema.md).
6. Concluir a validação local. A publicação e a migração serão operações posteriores, executadas conforme a janela de manutenção definida para o projeto.

## Critérios de aceitação e validação

- Professor: aceitar exatamente 11 a 17/10/2027 e recusar datas externas, inclusive 10 e 18/10; preservar sobreposições e fim de semana.
- Servidor: aceitar exatamente 28 e 29/10/2027, recusando também 27 e 30/10 e 01 e 02/11.
- Referência: sem escolha local, usar a data institucional; selecionar explicitamente essa mesma data conserva a escolha; restaurar remove somente a chave correspondente.
- Aplicabilidade: não oferecer observâncias em anos sem policy ou quando o evento não estiver disponível para as ofertas do calendário.
- Contagem: sobreposição em 29/10 desconta a data uma única vez; mover o Servidor libera 28/10 quando não houver outro impedimento.
- Períodos: recalcular corretamente términos definidos por dias letivos e preservar as validações de sobreposição e escopo das ofertas.
- Base: a escolha local não altera a identidade do conteúdo institucional; atualizações da base não apagam escolhas silenciosamente.
- Conflitos: calendário e histórico continuam acessíveis com escolha inválida ou evento removido; a interface permite limpar a escolha e o servidor recusa novas datas inválidas.
- Catálogo: impedir alterações incompatíveis com as regras de observância, incluindo mudança de ano que rompa o vínculo.
- Migração: converter conteúdos e snapshots, inclusive lixeira, com idempotência e preservação de versões, datas, eventos, pareceres e demais vínculos.
- Histórico: preservar a projeção e o significado dos snapshots, sem recalcular seu conteúdo pela policy atual.
- Regras: registrar a nova versão como flexibilização e detectar futuras mudanças nas observâncias sem alterar fingerprints antigos.
- Interface: conferir aplicação, restauração, descarte, rascunhos, permissões, confirmação do salvamento, teclado e foco em desktop e mobile.
- Importação: recusar explicitamente arquivos com o campo antigo, sem perda silenciosa de escolhas.
- Impressão: conferir a prévia e a impressão no Chromium com a data escolhida e os períodos resultantes.
- Arquitetura: manter o domínio independente dos adaptadores e sem ciclos de imports em runtime.

Durante o desenvolvimento, executar a menor suíte que exercite o comportamento afetado e adicionar regressões pelos fluxos reais. Antes de concluir mudanças de código, executar `pnpm check`, conforme [Verificação](../verificacao.md). Conferir referências visuais no macOS quando houver mudanças intencionais de interface.

Testes remotos continuam sujeitos ao opt-in e ao isolamento descritos na documentação. Testes não executados não contam como aprovação. A release usa `pnpm deploy:production`, sem repetir a suíte de desenvolvimento durante a janela de publicação.
