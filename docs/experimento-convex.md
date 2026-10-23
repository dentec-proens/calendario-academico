# Experimento de integração nativa com Convex

Este worktree parte de `f6b8f185fd8589101df70ec513136c7674e9deb9`, na branch `codex/convex-migration`. Preserva o portal React, o editor e as regras de calendário dessa referência, com autenticação, APIs, persistência e arquivos executados pelo Convex. A instalação atual permanece em seu checkout, com seus próprios processos, configuração e banco.

O ambiente é exclusivo do experimento, no team [Diretoria de Ensino Técnico — PROENS](https://dashboard.convex.dev/t/diretoria-de-ensino-tecnico-proens). O projeto é [calendario-academico-convex-lab / oceanic-gazelle-652](https://dashboard.convex.dev/t/diretoria-de-ensino-tecnico-proens/calendario-academico-convex-lab/oceanic-gazelle-652), com backend `https://oceanic-gazelle-652.convex.cloud` e portal local em [http://127.0.0.1:4183](http://127.0.0.1:4183).

## Estado da migração

Estado registrado em **23/10/2026: dados estruturados importados e conferidos; 13 PDFs adiados por decisão do usuário**. A conclusão dessa cópia para o laboratório não constitui uma troca do ambiente de produção.

A origem é o projeto Supabase [heqytxslokehuyrlxsza](https://supabase.com/dashboard/project/heqytxslokehuyrlxsza), da conta Dentec. A exportação foi feita somente para leitura, sem alterar o banco de origem. O inventário identificado contém:

| Conjunto                          | Quantidade |
| --------------------------------- | ---------: |
| Membros                           |         33 |
| Campi                             |         29 |
| Calendários                       |         60 |
| Versões anteriores de calendários |        699 |
| Históricos em PDF                 |         13 |
| Pareceres                         |          3 |
| Registros de auditoria            |        918 |

A importação preservou os IDs da aplicação, as fotografias completas das versões, os metadados, os vínculos com campi, as referências documentais e as 12 versões dos três pareceres. A estrutura do Convex usa seus próprios IDs internos sem trocar esses identificadores de domínio.

**Os 13 PDFs permanecem pendentes.** O usuário decidiu adiar a transferência dos arquivos devido à quota de saída do Supabase. Os metadados e as referências aos objetos são preservados; o download e uma nova análise desses PDFs aguardam a importação dos bytes. Um histórico com análise já registrada pode conservar os resultados existentes, mas isso não significa que seu arquivo já esteja disponível no Convex.

O importador concluiu 67 lotes de dados e 193 de versões, conferiu as contagens de 17 coleções e comparou por SHA-256 o conteúdo de 1.817 registros. Os 33 perfis foram conferidos após a retirada de hashes e salts de suas representações públicas; 24 credenciais scrypt foram vinculadas ao Convex Auth e comparadas com os segredos de origem. As nove contas restantes não possuíam credencial local importável. O relatório sanitizado está em [evidencias-convex/native-migration.json](evidencias-convex/native-migration.json).

Uma verificação local com a cópia real abriu os 30 calendários ativos, a lixeira com outros 30, o parecer disponível e a primeira página de auditoria usando os handlers nativos. Backups anterior e posterior do laboratório e a exportação original permanecem em arquivos locais privados, ignorados pelo Git. A autorização temporária da migração foi removida do deployment após a conclusão. O marcador impede retomar a mesma importação com um manifesto diferente; os PDFs adiados precisarão de uma etapa específica de transferência, sem repetir a substituição dos dados estruturados.

## Arquitetura nativa

O servidor `server-native.mjs` na porta 4183 serve somente os arquivos compilados de `dist/native`. Ele não abre PostgreSQL, não inicializa o Supabase e não atende `/api/*`: as chamadas do navegador seguem diretamente para as funções do Convex. A notação de caminhos da API anterior é mantida no cliente para preservar os fluxos da interface, sem um gateway HTTP Node no caminho de dados.

O portal usa `ConvexAuthProvider` e `ConvexReactClient`. As assinaturas das queries atualizam o portal React quando os dados mudam. O editor também acompanha alterações remotas; o controle da revisão esperada continua necessário para impedir que outra sessão substitua silenciosamente uma edição local. Reatividade não equivale à mesclagem automática dos rascunhos de duas pessoas.

| Responsabilidade                                           | Implementação                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| Identidade e sessões                                       | Convex Auth; validação do membro ativo e da sessão no backend             |
| Consultas do domínio                                       | `convex/native.ts`, com escopo de campus e dados seguros para a interface |
| Alterações de calendário, catálogo, documentos e pareceres | Mutations Convex; leitura, regra de domínio e gravação na mesma transação |
| Membros, convites e recuperação manual                     | `convex/nativeAuth.ts`                                                    |
| Upload e armazenamento de PDF                              | Convex Storage, com tickets e validação dos bytes no backend              |
| Geração de PDF e análise do histórico                      | Actions Node do próprio Convex, em `convex/nativeActions.ts`              |
| Portal, editor e páginas de acesso                         | Build Vite nativo; servidor local apenas estático                         |

Cada mutation aplica as regras de negócio e grava somente os registros alterados dentro da mesma transação Convex. O salvamento verifica a versão esperada do calendário e a revisão da base institucional. Pareceres também verificam suas próprias revisões e exigem confirmação ao reaproveitar conclusões após mudanças. Versões anteriores de calendários, históricos de pareceres e auditoria permanecem protegidos contra substituição.

Os registros da aplicação ficam em documentos individuais. As fotografias completas das versões anteriores ficam separadas de seus metadados, evitando transferir todas as fotografias a cada abertura. O codec preserva propriedades explicitamente `undefined` e nomes de campos reservados nos dados persistidos; as respostas públicas mantêm o formato JSON esperado pela interface.

## Autenticação e autorização

O login por senha é nativo do Convex Auth. As contas importadas mantêm os IDs e as credenciais compatíveis da aplicação anterior; a vinculação das 24 credenciais locais foi concluída e conferida. As sessões antigas foram preservadas como dados de origem e não se tornam sessões autenticadas do Convex: os usuários entram novamente no laboratório. Não há cadastro público irrestrito: a administração provisiona os membros e os convites autorizados.

As funções conferem a identidade, a existência da sessão e o cadastro ativo. O perfil e o campus vêm do registro no backend, nunca dos parâmetros enviados pelo navegador. Contas CAMPUS acessam somente seus calendários e históricos; a revisão pela PROENS e a publicação de documentos institucionais exigem ADMIN. As respostas públicas não incluem salts, hashes de senha ou tokens administrativos.

Login por senha, convites e redefinição manual de senha foram implementados no caminho nativo. **Google e envio de e-mail permanecem desativados enquanto faltarem as credenciais dos respectivos provedores.** Isso inclui o envio automático da recuperação de senha. A disponibilidade do login Google de uma conta que só usava esse provedor depende dessa configuração ou de uma redefinição de acesso pela administração.

O deployment usa `JWT_PRIVATE_KEY`, `JWKS` e `SITE_URL` para Convex Auth. Essas variáveis pertencem ao ambiente de backend. `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET`, quando configuradas, também ficam no deployment. Nenhuma chave privada deve entrar em variáveis `VITE_*`, no bundle, em relatórios ou no Git.

## Arquivos e geração de PDF

Um usuário autenticado solicita um ticket de upload, envia ao Convex Storage e conclui a validação pelo backend. São conferidos o limite de 8 MB, o tamanho informado, a assinatura `%PDF-` e o SHA-256 calculado no servidor. O cadastro do documento ou do histórico consome o upload validado na mesma mutation que registra seus metadados, verificando dono, validade e uso anterior.

Os downloads usam tokens aleatórios com apenas seu hash persistido e validade de um minuto. A validade é verificada em uma mutation a cada download. A limpeza preserva os anexos já vinculados e elimina os arquivos temporários gerados para exportação após o prazo de retenção.

O calendário é renderizado em uma action Convex com Puppeteer e Chromium. O renderizador incorpora CSS e logomarca no documento e bloqueia requisições de rede da página. A preparação do Chromium considera ARM64 e x64, incluindo as bibliotecas compartilhadas; a preparação é compartilhada por chamadas concorrentes em um mesmo worker. A geração real no cloud retornou um PDF válido de 382.797 bytes; envio, leitura automática de histórico e exportação do parecer também foram exercitados no backend nativo.

## Executar neste worktree

Use a configuração isolada já existente em `.env.convex.local`; não copie o `.env` da instalação atual. O build nativo precisa de `CONVEX_URL` apontando para o deployment de laboratório e usa a porta indicada por `PORT`, normalmente 4183. A seleção do modo nativo é feita pelo próprio comando de build.

```sh
pnpm install --frozen-lockfile
pnpm run build:convex:native
pnpm run start:convex:native
```

O primeiro comando de build atualiza os recursos de impressão e compila portal, editor, logs, ativação e recuperação de senha em `dist/native`. O segundo inicia apenas o servidor estático. Para reconstruir após mudanças na interface, execute novamente o build e recarregue o navegador.

As funções do backend são implantadas separadamente:

```sh
pnpm run typecheck:convex
pnpm run convex:push
```

O CLI usa a seleção de deployment da sua configuração Convex, normalmente em `.env.local`. Antes de implantar, confirme que o alvo continua sendo `oceanic-gazelle-652`, no projeto de laboratório. O servidor estático não implanta funções nem inicializa dados ao subir.

Os comandos `dev`, `start` e `db:*` continuam disponíveis para a referência PostgreSQL. `dev:convex` e `start:convex` pertencem à antiga etapa com adaptador Node e não iniciam o runtime nativo. Evite iniciar dois servidores na mesma porta.

## Ponte legada

A ponte por `DENTEC_CONVEX_BRIDGE_SECRET` foi mantida para compatibilidade com testes e ferramentas da primeira etapa. Ela não participa da autenticação, das consultas ou das mutations do portal nativo.

A ponte foi desativada neste deployment pela remoção de `DENTEC_CONVEX_BRIDGE_SECRET`: uma chamada com o antigo segredo foi recusada. A configuração nativa continua funcionando sem ele. Preserve credenciais e backups somente em arquivos locais ignorados pelo Git, com acesso restrito.

## Validação e limites atuais

Comandos de verificação:

```sh
pnpm run format:check
pnpm run lint
pnpm run typecheck:convex
pnpm run build:convex:native
pnpm test
pnpm run test:convex
```

A rodada local final executou **206 testes: 202 passaram, nenhum falhou e quatro foram ignorados**. O ensaio cloud de reatividade com duas sessões passou; os fluxos de autenticação, documentos, histórico, parecer e PDF foram verificados separadamente no Convex real. A suíte completa no modo `test:convex` repetiu o resultado: **206 testes, 202 aprovados, nenhum erro e quatro skips**. Os detalhes estão em [evidencias-convex/native-verification.json](evidencias-convex/native-verification.json). Os testes cloud exigem credenciais de uma conta sintética em ambiente descartável; a fixture anterior não deve ser usada após a importação dos dados reais.

Os quatro skips da suíte local são a integração PostgreSQL externa, o Chromium serverless opcional e os dois ensaios browser que exigem um deployment nativo de teste. O Chromium do cloud e a reatividade foram exercitados em verificações próprias antes da substituição das fixtures pelo conjunto real.

Os testes nativos executam handlers reais do Convex em bancos descartáveis do `convex-test`, incluindo autenticação e autorização, concorrência entre revisões, preservação das versões, revisão desatualizada, lixeira, arquivos, hashes, tickets e limpeza. Eles não precisam das credenciais da origem nem alteram o Supabase. A importação dos dados reais e o PDF no cloud exigem evidências próprias; o sucesso da suíte não comprova essas etapas.

Permanecem os limites explícitos do experimento: leitura de até **1.000 registros por coleção**, até **5.000 versões por histórico** e até **800.000 bytes por documento codificado**. O importador usa lotes, mas isso não remove os limites das consultas de uso normal. Eles ainda precisam de uma estratégia de paginação e avaliação de volume antes de uma adoção em produção.

A auditoria é acrescentada sem carregar todo seu histórico nas operações comuns. A tela de logs lê 100 entradas por página, com índice por campus ou global para ADMIN, e aceita offsets de até 8.000. A exportação integral continua sujeita aos limites de leitura. A arquitetura nativa desta etapa é um experimento funcional, com avaliação de escala e operação ainda necessária.

## Histórico: primeira etapa de persistência

O commit local `422667e` registrou a primeira integração: as APIs, a autenticação e o PDF passavam pelo servidor Node, com persistência e arquivos no Convex. O portal ainda não usava assinaturas reativas.

Em 23/10/2026, `scripts/convex-smoke.mjs` executou dez verificações desse caminho HTTP → Node → Convex, com dados sintéticos, salvamento, concorrência, versões, revisão e PDF. O relatório preservado está em [evidencias-convex/smoke.json](evidencias-convex/smoke.json). Essa evidência descreve a etapa antiga, não a autenticação e as APIs nativas atuais. Suas fixtures sintéticas podem ser substituídas pela importação autorizada dos dados reais no deployment de laboratório.
