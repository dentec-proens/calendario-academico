# Experimento de persistência com Convex

Este worktree parte do commit `f6b8f185fd8589101df70ec513136c7674e9deb9`. O objetivo é testar a troca da persistência por Convex preservando o portal React, o editor, as APIs, as regras de calendário e os fluxos de administração e revisão dessa versão.

O worktree e o projeto Convex são exclusivos do experimento. A instalação atual continua usando seus próprios arquivos, configuração, processo e banco. O deployment de desenvolvimento pertence ao team [Diretoria de Ensino Técnico — PROENS](https://dashboard.convex.dev/t/diretoria-de-ensino-tecnico-proens).

O projeto criado é [calendario-academico-convex-lab / oceanic-gazelle-652](https://dashboard.convex.dev/t/diretoria-de-ensino-tecnico-proens/calendario-academico-convex-lab/oceanic-gazelle-652). O backend atende em `https://oceanic-gazelle-652.convex.cloud`; o portal de teste permanece em [http://127.0.0.1:4183](http://127.0.0.1:4183).

## Arquitetura deste teste

O navegador continua acessando o servidor Node na mesma origem. Login, sessões, autorização por campus, validação e geração de PDF continuam passando pelas APIs existentes. O servidor usa os adaptadores de dados e arquivos do Convex; nesse modo ele não abre conexão PostgreSQL nem inicializa o Storage do Supabase.

As funções do Convex são acessadas pelo servidor com `DENTEC_CONVEX_BRIDGE_SECRET`. Esse segredo precisa ser igual no servidor Node e nas variáveis do deployment Convex. Ele não vai para o bundle React, variáveis `VITE_*`, navegador ou Git. A autorização dos usuários continua sendo conferida no backend Node, como na versão de referência.

O experimento usa os cookies próprios `dentec_convex_lab_session` e `dentec_convex_lab_google`. Essa separação evita interferência na sessão de uma versão de referência aberta no mesmo host, pois os navegadores compartilham cookies entre portas do mesmo domínio. Os nomes de cookie originais permanecem no modo PostgreSQL.

Esta etapa preserva o contrato de persistência usado pela aplicação para permitir comparar comportamentos. A assinatura reativa do React e uma eventual mudança de autenticação são trabalhos posteriores. Manter esse limite ajuda a atribuir diferenças observadas à migração da persistência.

Os registros das coleções da aplicação ficam em documentos individuais: contas, campi, calendários, históricos, sessões, convites, documentos, pareceres e auditoria. O catálogo institucional e extensões da raiz são valores próprios. As fotografias completas das versões de calendário ficam separadas dos metadados de histórico; uma leitura comum não transfere todas as fotografias anteriores. O codec conserva propriedades explicitamente `undefined` e nomes de campos reservados, sem converter esses dados silenciosamente em `null`.

Cada alteração lê um snapshot, executa a regra de domínio e envia somente os registros alterados. A mutation confere revisões por escopo, grava o delta e atualiza as revisões na mesma transação. Um conflito refaz a operação sobre um snapshot novo; após as tentativas limitadas, a API recebe um erro 409. As versões de calendário, os históricos de pareceres e os registros anteriores de auditoria continuam protegidos contra substituição.

O backend experimental recusa consultas que ultrapassem 1.000 registros de uma coleção, históricos com mais de 5.000 versões e documentos codificados maiores que 800.000 bytes. Essas proteções produzem erro explícito e precisam ser consideradas na avaliação de volume e em uma futura estratégia de paginação. PDFs ficam no armazenamento de arquivos do Convex.

As operações comuns não carregam os registros anteriores da auditoria: acrescentam somente os novos eventos. A tela de logs usa uma consulta própria de 100 entradas, com índice por campus para contas CAMPUS e índice global para ADMIN. Ela preserva os parâmetros `offset` da interface existente; para manter cada consulta limitada, aceita offsets de até 8.000. A tentativa de abrir uma página posterior produz erro explícito. Uma implementação de maior escala deve usar cursores e exportação em lotes. A existência de mais de 1.000 eventos de auditoria não bloqueia login, recuperação de senha, documentos ou edição dos calendários; a exportação integral ainda obedece ao limite geral de leitura deste experimento.

## Configuração isolada

O worktree entregue já contém `.env.convex.local` configurado para o deployment de teste e uma conta sintética criada. Para usá-lo, inicie com `pnpm run dev:convex` e consulte o login no arquivo local ignorado `.env.convex.test-login`. Não substitua a configuração já preparada pelo exemplo.

Os passos abaixo servem para reproduzir a configuração em outra cópia isolada. No diretório dessa nova cópia:

```sh
cp .env.convex.example .env.convex.local
pnpm install --frozen-lockfile
```

Preencha o arquivo `.env.convex.local`, que é ignorado pelo Git:

| Variável                                  | Uso                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `DENTEC_BACKEND=convex`                   | Seleciona explicitamente o adaptador experimental                     |
| `CONVEX_URL`                              | URL HTTPS do deployment de desenvolvimento                            |
| `DENTEC_CONVEX_BRIDGE_SECRET`             | Segredo aleatório de pelo menos 32 caracteres, igual ao do deployment |
| `PORT=4183`                               | Porta própria do experimento                                          |
| `DENTEC_PUBLIC_URL=http://127.0.0.1:4183` | Origem usada pelas APIs locais                                        |
| `DENTEC_SETUP_EMAIL`                      | E-mail institucional opcional da primeira administração               |
| `DENTEC_SETUP_CODE`                       | Código inicial opcional, de pelo menos 32 caracteres                  |
| `DENTEC_PDF_BROWSER`                      | Caminho local do Google Chrome/Chromium para exportar PDF             |

O projeto inicia com dados novos de teste e o cadastro de campi da aplicação. Não copie `.env` da instalação atual, credenciais de produção, snapshots institucionais ou bancos existentes para esse ambiente. O arquivo `.env.local` criado pelo CLI do Convex identifica o projeto para seus próprios comandos; o servidor Node carrega somente `.env.convex.local` nos comandos abaixo.

Para rodar com recompilação do portal:

```sh
pnpm run dev:convex
```

Para compilar e iniciar sem o observador de arquivos:

```sh
pnpm run build
pnpm run start:convex
```

Esses comandos usam `node --env-file=.env.convex.local`. Também é possível injetar as variáveis diretamente no ambiente e executar `node server.mjs`. Quando `DENTEC_BACKEND=convex`, o servidor não lê `.env`. Se faltar URL ou segredo, ele encerra com erro de configuração, sem recorrer ao PostgreSQL.

Abra [http://127.0.0.1:4183](http://127.0.0.1:4183). Em uma instalação vazia, o terminal informa o código para criar a primeira conta ADMIN. Se `DENTEC_SETUP_EMAIL` estiver definido, use exatamente esse e-mail institucional. Esse código pertence à instalação de teste.

O login Google e o envio de recuperação de senha são opcionais no desenvolvimento. Para testar Google, configure um cliente próprio com redirect URI `http://127.0.0.1:4183/api/google/callback`. A exportação de PDF usa o renderizador Node existente; no macOS, um caminho comum para `DENTEC_PDF_BROWSER` é `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

## Validação funcional

```sh
pnpm run format:check
pnpm run lint
pnpm run typecheck:convex
pnpm run build
pnpm test
pnpm run test:convex
```

A suíte da versão de referência continua disponível no caminho PostgreSQL. Os testes de configuração do experimento verificam a seleção explícita, a porta separada, os requisitos de segurança do bridge e a recusa de iniciar no modo Convex sem sua configuração.

`test:convex` executa a mesma suíte, selecionando handlers Convex reais em bancos descartáveis do `convex-test` para as fixtures da aplicação. Isso inclui os três testes de navegador do portal e do editor. Os testes específicos de SQL continuam usando suas próprias fixtures; nenhum desses comandos precisa de credenciais Convex ou acessa o deployment na nuvem. O CI executa os dois modos.

Na instalação Convex, os testes representativos devem cobrir:

1. Criar a administração, entrar, sair e entrar novamente após reiniciar o servidor Node.
2. Criar membros e contas CAMPUS; conferir acesso permitido e bloqueio entre campi.
3. Criar um calendário, alterar períodos e eventos, salvar e reabrir em outra sessão.
4. Abrir o mesmo calendário em duas sessões e conferir o controle de revisões concorrentes.
5. Preservar e consultar versões anteriores; conferir análise e revisão pela PROENS.
6. Cadastrar documentos e calendários anteriores em PDF; conferir upload e leitura com sessão autorizada.
7. Gerar e baixar o PDF do calendário, mantendo nomes, layout e conteúdo da versão de referência.
8. Conferir registros de auditoria, convites e recuperação de senha conforme os serviços opcionais configurados.

Registre separadamente os resultados executados, falhas encontradas e funcionalidades ainda sem validação. Compilar o portal ou publicar funções no Convex não comprova sozinho esses fluxos.

## Evidência executada no deployment de desenvolvimento

Em 23/10/2026, o script `scripts/convex-smoke.mjs` executou dez verificações com sucesso, passando pelas APIs HTTP reais em `http://127.0.0.1:4183`, pelo deployment [calendario-academico-convex-lab / oceanic-gazelle-652](https://dashboard.convex.dev/t/diretoria-de-ensino-tecnico-proens/calendario-academico-convex-lab/oceanic-gazelle-652) e pela persistência e armazenamento de arquivos do Convex. A URL do backend é `https://oceanic-gazelle-652.convex.cloud`. O relatório sanitizado, com horários e resultados por etapa, está em [evidencias-convex/smoke.json](evidencias-convex/smoke.json).

| Verificação               | Resultado observado                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Instalação e autenticação | Conta ADMIN sintética criada; login e bootstrap autenticados; acesso anônimo bloqueado                                                                 |
| Calendário de teste       | Criado com `purpose: test` e rótulos explícitos de laboratório                                                                                         |
| Salvamento sem alteração  | Segundo envio idêntico preservou a versão 2 e informou `unchanged: true`                                                                               |
| Concorrência              | Dois envios da mesma revisão produziram HTTP 200 e 409; somente um se tornou a versão 3                                                                |
| Persistência independente | Novo adaptador conectado ao deployment confirmou a versão gravada e duas fotografias anteriores completas; leitura comum trouxe somente seus metadados |
| PDF real                  | Chrome gerou PDF de 502.272 bytes com assinatura `%PDF-`                                                                                               |
| Armazenamento Convex      | Ticket, upload pela API local e vinculação ao histórico foram concluídos; download autenticado foi idêntico byte a byte; anônimo recebeu 401           |
| Parecer                   | 29 critérios sintéticos salvos e minuta exportada; alteração posterior do calendário bloqueou a exportação desatualizada com 409                       |
| Sessão                    | Logout invalidou o acesso ao bootstrap, que passou a responder 401                                                                                     |

O calendário sintético `a83b5fa5-130b-449a-a508-d8f79d4e7025` e o arquivo de histórico sintético `e2938956-85fb-4b58-b233-5a152e30d855` foram mantidos como fixtures para exploração. O calendário terminou na versão 4 e seu parecer está propositalmente desatualizado para demonstrar a proteção. O PDF gerado no ensaio foi anexado como uma fixture do histórico de 2026; ele não representa um calendário institucional anterior.

O login e a senha aleatória ficam somente em `.env.convex.test-login`, com permissão `0600` e exclusão pelo `.gitignore`. O relatório não contém senha, cookie, código de instalação ou segredo do bridge. Nenhum dado institucional foi importado.

Após reiniciar o servidor com os cookies isolados, uma verificação adicional confirmou login 200 com `dentec_convex_lab_session`, logout 200 limpando o mesmo cookie e recusa 401 ao reutilizar a sessão encerrada. Esse resultado está em `followUpChecks` no relatório. Não foi criado outro calendário nessa verificação.

Para repetir o ensaio no mesmo deployment, com o servidor já iniciado:

```sh
node scripts/convex-smoke.mjs --allow-test-data
```

O script lê exclusivamente `.env.convex.local`, exige o modo Convex, a origem local na porta 4183 e o deployment esperado `oceanic-gazelle-652`. Sem a opção de autorização de dados sintéticos, ele recusa as escritas. Uma execução nova cria outro calendário sintético e atualiza o relatório. Para outro deployment de laboratório, é necessário fornecer explicitamente `--expected-deployment=nome-do-deployment` e uma configuração isolada correspondente.

Esse ensaio valida o caminho HTTP → Convex → HTTP e a exportação real de PDF. Ele não substitui a verificação visual da navegação no portal React. Reatividade do React e mudança de autenticação continuam fora do escopo deste experimento controlado de persistência.

## Referência PostgreSQL

Sem `DENTEC_BACKEND`, o servidor preserva a configuração PostgreSQL de referência. Os comandos `dev`, `start` e `db:*` mantêm seu propósito original e não representam o experimento Convex. Isso permite executar a suíte de referência sem alterar suas expectativas de configuração.

Para encerrar o servidor experimental, use Ctrl+C no seu terminal. O worktree pode ser mantido para comparar os resultados com a versão atual.
