# Desenvolvimento

O projeto usa Node.js 24 e pnpm 12.15.0. Cada desenvolvedor possui uma conta Convex e um deployment individual no projeto `calendario-academico`, team `diretoria-de-ensino-tecnico-proens`. `.env.local` identifica esse desenvolvimento e permanece fora do Git.

## Preparação

```sh
pnpm install --frozen-lockfile
pnpm dev:setup
pnpm env:doctor
```

A preparação seleciona o desenvolvimento da conta no projeto da equipe e preserva uma configuração local válida. Não copie `.env.local` de outro desenvolvedor. `env:doctor` confere destinos e URLs sem chamadas remotas.

Em um deployment vazio, `dev:setup` publica as funções e prepara campi, catálogo e autenticação. Gera o par `JWT_PRIVATE_KEY`/`JWKS` somente se ambos estiverem ausentes; um par incompleto interrompe o comando. Define `SITE_URL` local quando ausente. Havendo dados, não os sobrescreve nem importa produção.

Se não há usuários, o terminal apresenta um código privado de instalação. Inicie a aplicação e preencha nome, código, e-mail institucional e senha própria para criar o primeiro ADMIN. As demais contas são criadas pela administração. Não há credenciais fixas no código.

## Rotina

```sh
pnpm dev
```

O comando acompanha Convex e serve o Vite em [localhost:4183](http://127.0.0.1:4183). Ctrl+C encerra os dois processos. O frontend é uma SPA; as rotas do editor, revisão e acesso usam a mesma raiz React.

Para conferir o artefato estático:

```sh
pnpm build
pnpm start
```

Comandos e referências visuais estão em [Verificação](verificacao.md).

## Organização e tipos

`web/app/` reúne navegação e sessão; `web/features/` contém os assuntos da interface; `web/shared/` oferece infraestrutura reutilizável. `src/domain/calendar/commands/` contém comandos puros, e `src/printing/` atende a prévia impressa sem importar a interface. Convex usa funções por domínio e contratos gerados.

Todo código manual usa TypeScript estrito. Valores externos são validados antes de entrar nos contratos. `convex/_generated/` é gerado; não o edite manualmente.

TanStack Intent carrega a orientação das versões instaladas. Consulte `AGENTS.md`, use `pnpm exec intent list`, carregue a skill pertinente com `pnpm exec intent load IDENTIDADE` e execute `pnpm agents:check`. Devtools está disponível em desenvolvimento por `?devtools=1` nas rotas permitidas; credenciais, tokens e arquivos ficam fora da instrumentação.

## Dados e edição

Novos conteúdos e cópias usam `schemaVersion: 4`, com IDs de ofertas independentes dos seus tipos e etapas configuradas por ciclo. Eventos e períodos se associam aos IDs; eventos institucionais continuam selecionados por tipo. Na release A, o armazenamento aceita legado para conversão, mas o cliente só troca v4 e não importa cópias antigas. Datas acadêmicas são `YYYY-MM-DD`. Regras de domínio, transações e formulários possuem responsabilidades distintas. Consulte [Conteúdo v4 e política de 2027](arquitetura-convex.md#conteúdo-v4-e-política-de-2027).

O formulário conserva preenchimento ainda não aplicado; comandos atualizam o calendário da sessão; autosave confirma sua gravação no Convex. Rascunhos não sensíveis são isolados por usuário e entidade e limpos ao encerrar a sessão. Não há persistência durável offline.

## Constantes compartilhadas do calendário

`src/domain/calendar/config.ts` é a fonte comum de ofertas e rótulos, ciclos e organizações, quantidades permitidas de etapas, quantidade de períodos por organização, limites de ano e duração. O módulo não depende de React nem de Convex. A interface, os validadores Convex e as funções de domínio importam essas definições; `src/domain/calendar/modalities.ts` mantém os helpers de escopo e reexporta o catálogo por compatibilidade.

As referências normativas de dias letivos pertencem às políticas de `src/domain/policies/`. Cada política decide sua aplicabilidade; por exemplo, os mínimos de contagem de 2027 exigem oferta abrangida e escopo confirmado, em `consup-292-2027.ts`. Para um novo ano, implemente `CalendarPolicy` num módulo próprio e registre-o em `registry.ts`. Alterar um mínimo não significa estendê-lo automaticamente a outro ano ou norma.

Nas políticas vinculadas, toda mudança no catálogo, inclusive de redação, acrescenta uma versão em `rulesetChanges` com fonte, resumo, critérios afetados e efeito; versões publicadas não são editadas. `test/domain/ruleset-history.test.ts` calcula uma impressão digital do que campus e revisores veem do catálogo (atividades, rótulos, aplicabilidade e notas por oferta, janela e mínimos) em calendários de referência, para 2026, 2027 e anos sem norma, e falha quando ele muda sem nova versão; registre a impressão da nova versão nesse teste. Todo campo de `ActivityRequirement` entra na impressão, exceto os que só atuam pela aplicação por oferta. A política de 2026 e a de anos sem norma não têm histórico: confirme a mudança e substitua a impressão delas. Refatorações que não mudam regras mantêm todas as impressões.

Atividades publicadas não saem da tabela: eventos salvos apontam para elas, e a normalização recusa um vínculo que não está na lista de atividades. Para dispensar uma atividade, mantenha a linha e a torne opcional com `optionalFor`. O mesmo teste compara as atividades declaradas com `releasedActivities` e pede o registro de cada atividade nova. Classifique o efeito pelo impacto em revisões já feitas: apenas `tightens` reabre revisão e base. Os critérios estão em [Mudanças de regra](arquitetura-convex.md#mudanças-de-regra).

Para mudar uma exigência, edite a linha da atividade na tabela da política: `modalities` restringe as ofertas exigidas, `optionalFor` dispensa ofertas com a nota exibida e `decision` registra uma decisão que não está no texto da norma. Depois confira a página **Regras do calendário** (`/regras`) contra a norma; ela lê a mesma tabela e não precisa ser gerada.

Para um novo ano com norma própria, copie o módulo do ano anterior em vez de herdar dele, ajuste prefixo, tabela, janela, mínimos e critérios conforme a nova norma, comece `rulesetChanges` com uma versão `establishes` e registre a política em `registry.ts`. Mantenha os IDs das atividades que continuam existindo; a política de 2027 conserva como vínculos legados opcionais os IDs da lista operacional que a tabela não declara, e uma nova política deve fazer o mesmo com os IDs do ano anterior.

Novas ofertas entram apenas com organização completa. O comando monta um único estado e a mutation atualiza conteúdo, catálogo de ofertas do registro e versão na mesma transação. Ofertas existentes não são removidas por esse fluxo. Snapshots anteriores conservam seu escopo; registros locais antigos sem modalidades explícitas não são estendidos à nova oferta.

## Integração do trabalho

Use dados de teste no desenvolvimento individual. As contas da aplicação são distintas das contas administrativas Convex/GitHub. Antes de integrar mudanças, execute os comandos obrigatórios de [verificação](verificacao.md) e confira os [componentes compartilhados](componentes-interface.md).

A publicação usa o [procedimento operacional](implantacao-convex-vercel.md), com commit conferido, expansões compatíveis do backend, migrações aditivas com checkpoint e validação dos dois frontends antes da promoção pública.

## Integração no desenvolvimento atual

O modo E2E de desenvolvimento usa somente o dev conferido em `.env.local` e exige opt-in explícito. `pnpm e2e:setup` prepara conta, campus, ano e fontes próprios, preservando registros preexistentes. As credenciais e a fixture ficam em arquivos ignorados pelo Git. Inicie o frontend local e execute `pnpm test:e2e` em outro terminal.

O modo não usa a flag de ambiente descartável e não habilita produção. O frontend precisa apontar ao mesmo backend conferido. Pré-requisitos, variáveis e limites estão em [Verificação](verificacao.md).
