# Testes do portal React no Supabase pessoal

Validação realizada em 22/10/2026, com o portal React/Vite/Lucide servido localmente e o PostgreSQL do projeto `calendario-academico-testes` (`uzhrjqjlhfhacbcmzguq`). A produção DENTEC não foi acessada nem alterada durante esta rodada. A cópia dos PDFs permanece adiada.

## Fluxos verificados no Chrome

- Login ADMIN temporário, rejeição de senha incorreta e logout.
- Exibição dos 30 calendários ativos e dos 30 calendários na lixeira; filtro de Cascavel com os dois registros esperados.
- Base institucional com 34 eventos migrados.
- Abertura do parecer migrado: revisão 4, 29 critérios, quatro conferidos; visualização com tabela de 30 linhas, sem regravar o parecer existente.
- Criação de calendário sintético com duas modalidades; edição de semana e período, salvamento no PostgreSQL e persistência após recarregar a página.
- Exclusão recuperável e restauração desse calendário sintético.
- Gravação de parecer sintético com autoria, versão e critério conferido; visualização e downloads HTML/TXT com conteúdo verificado.
- Login CAMPUS temporário limitado a Cascavel: dois calendários, sem administração, revisão institucional ou filtro de outros campi.
- Portal e parecer em viewport de 390 × 844, sem conteúdo ultrapassando a largura da tela; configuração temporária do navegador restaurada ao final.

Os testes de gravação utilizaram campi, usuários, calendário e parecer temporários. A primeira limpeza confirmou igualdade dos dados funcionais com o backup anterior. A única diferença operacional foi a remoção normal de tentativas de login expiradas. Sessões expiradas não são restauradas.

## Correções identificadas

- Removida a classificação de calendário `[DEFINITIVO]`/`[TESTE]` dos nomes dos campi na administração.
- As consultas de documentos e lixeira passaram a carregar somente as entidades necessárias. Os testes verificam também as tabelas SQL acessadas e os contratos de visibilidade.
- Detectado recálculo involuntário de datas ao abrir um calendário no editor. O servidor de QA foi encerrado antes do salvamento automático; a comparação posterior confirmou que o calendário migrado permaneceu intacto. A correção e a regressão desse fluxo estão registradas na validação final abaixo.

## Repetir com dados temporários

Após o build, com `.env` apontando para o projeto pessoal de testes:

```sh
pnpm run build
node --env-file=.env scripts/lib/portal-supabase-qa.mjs
```

O harness valida o identificador do projeto e a role `dentec_test_app` antes de conectar. Cria um backup e um contexto privados em `data/migration-backups/portal-qa-<uuid>/`, abre uma porta local livre e disponibiliza contas sintéticas. Não configura Storage, envio de e-mail ou autenticação Google.

Uma barreira adicional verifica cada alteração dentro da transação, antes da persistência: gravações fora das fixtures recebem HTTP 403. Ela cobre inclusive um eventual autosave involuntário e foi testada com rollback integral. A aplicação normal mantém seus controles de autorização; essa barreira pertence somente ao harness de QA.

No terminal do harness, `stats` grava as métricas das requisições. `cleanup` encerra o servidor, remove somente as fixtures desta execução e grava `cleanup-report.json` com a comparação de preservação. Não substitui o banco por um backup, nem sobrescreve alterações concorrentes.

Os relatórios privados, credenciais e backups ficam ignorados pelo Git. As exportações usadas no teste são sintéticas. Downloads dos PDFs históricos, uploads para Storage, Google OAuth, envio de e-mail e tramitação no SEI não fazem parte desta rodada.

## Validação final

- `npm run build`: passou.
- `npm test`: 137 testes, 135 aprovados, dois pulados e nenhuma falha. Os testes opcionais pulados dependem de configuração externa de PostgreSQL e de Chromium serverless; a integração desta rodada usou o Supabase pessoal real.
- A regressão do editor reproduz a falha antiga e verifica que carregar o registro e avançar o ciclo de autosave não gera PUT nem altera datas/versão; editar evento ou período continua recalculando e salvando.
- Na segunda rodada real, o calendário migrado ficou aberto por mais de 50 segundos sem recálculo de datas e sem requisição PUT. O console não registrou erros nessa verificação.
- Documentos e lixeira responderam HTTP 200 após a redução do escopo SQL. As primeiras amostras da nova rodada ficaram em aproximadamente 0,7 segundo por consulta; as amostras anteriores variavam entre 2,4 e 9,3 segundos. São observações da sessão, sem benchmark controlado.
- Acesso direto a um calendário de outro campus retornou HTTP 404 na sessão CAMPUS.
- As duas execuções foram encerradas e suas fixtures removidas. A segunda limpeza retornou `exactMatch: true`, `businessDataMatch: true` e nenhuma coleção alterada. A base preserva os 60 calendários, 699 revisões arquivadas, 13 históricos e três pareceres migrados.

## Salvamento após operações aplicadas

O editor passou a agendar uma gravação 1,5 segundo após a última operação aplicada. Uma nova operação nesse intervalo substitui o agendamento anterior. Digitação em formulários sem Adicionar/Aplicar e abertura de registros continuam sem gravação. O botão Salvar no sistema antecipa o envio e cancela o agendamento pendente.

Se outra alteração for aplicada enquanto uma gravação estiver em andamento, ela permanece pendente e é enviada depois, usando a versão confirmada pelo servidor. A conversão para definitivo também mantém essa ordem. Erros de conexão pausam o envio até uma tentativa manual; conflitos de versão e sessão exigem reabrir o registro. O histórico de versões e a auditoria seguem as regras existentes.

A regressão de navegador cobre agrupamento de operações em uma única versão, antecipação manual sem duplicidade, edição durante requisição retida e durante conversão para definitivo. Os testes unitários cobrem ainda prazos de agendamento, conexão indisponível e bloqueio de conflitos. A suíte atual passou com 140 testes: 138 aprovados, dois opcionais pulados e nenhuma falha. O build também passou.

Na validação real pelo Chrome, preencher o formulário sem Aplicar não gerou PUT. Aplicar a semana e adicionar um período geraram exatamente duas gravações automáticas, sem usar o botão manual. A semana permaneceu salva após recarregar. Uma consulta SQL ao projeto pessoal confirmou versão 3, duas revisões arquivadas, cinco dias da semana e um período. O console ficou sem erros. Ao encerrar, todas as fixtures foram removidas e a comparação retornou igualdade exata com a base anterior.

## Instalação limpa e CI antes do commit

Na preparação do commit `5f7c21c`, o projeto usava npm e `package-lock.json`. `supabase/.temp/` foi incluído no Gitignore. O workflow passou a executar instalação, build, migração explícita do PostgreSQL descartável e suíte de testes, nessa ordem. A migração usa exclusivamente a URL do serviço de testes da CI. A adoção posterior do pnpm é descrita abaixo.

A validação foi repetida em uma cópia limpa dos arquivos candidatos, sem `node_modules`, build, `.env` ou dados locais. `npm ci` instalou as dependências do lockfile sem alterá-lo e informou zero vulnerabilidades. `npm run build` passou. Um PostgreSQL 16.15 novo, em container local acessível somente em `127.0.0.1`, reproduziu a falha de schema ausente; `npm run db:migrate` preparou esse banco e a suíte passou com 140 testes, 139 aprovados, uma ausência opcional de Chromium serverless no macOS e nenhuma falha. A integração PostgreSQL de concorrência, rollback e sessões foi executada nessa rodada.

Os arquivos da cópia validada foram comparados por hash com o workspace. O container de testes e seus volumes foram removidos. Nenhuma credencial remota foi carregada e a produção não foi acessada nesta validação.

## Adoção do pnpm 12.15.0

O projeto passou a fixar pnpm 12.15.0 em `packageManager`, com `pnpm-lock.yaml` como único lockfile. A importação preservou as versões e os hashes de integridade dos 123 pacotes da aplicação, sem atualizar dependências. CI, configuração de build da Vercel, instruções e inicializador Windows usam pnpm.

Em outra cópia limpa, sem `.env`, dados ou dependências preexistentes, passaram os comandos configurados para a Vercel: `npx --yes pnpm@12.15.0 install --frozen-lockfile` e `npx --yes pnpm@12.15.0 run build`. O lockfile permaneceu intacto. `pnpm audit` informou zero vulnerabilidades. Com PostgreSQL 16.15 descartável e migração explícita, `pnpm test` passou: 140 testes, 139 aprovados, uma ausência opcional de Chromium serverless no macOS e nenhuma falha.

O teste de `pnpm run dev` identificou que o build do Vite alterava `NODE_ENV` antes de iniciar o backend. O processo filho agora recebe explicitamente `development`. Sem configuração de hospedagem, o teste confirmou início local, respostas do portal e da API, recompilação após alterar CSS e entrega do novo arquivo, mantendo uma única instância do backend. O CSS original foi restaurado. Essa rodada também verificou o watcher sem executar o script opcional do `fsevents`, desabilitado em `pnpm-workspace.yaml`.

Os avisos `MODULE_LEVEL_DIRECTIVE` do Lucide continuam sem impedir o build. A instalação do workspace foi sincronizada com pnpm; os testes usaram somente o banco descartável local. Não houve publicação nem acesso ao Supabase de produção.
