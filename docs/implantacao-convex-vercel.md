# Implantação e operação

## Destinos e configuração

Os identificadores públicos ficam em [`config/environments.ts`](../config/environments.ts). Cada desenvolvedor usa sua conta e deployment individual. Produção usa o Convex `exuberant-cheetah-138` e o portal [calendario-academico-phi.vercel.app](https://calendario-academico-phi.vercel.app), no projeto Vercel `dentec-proens/calendario-academico`. O repositório é `dentec-proens/calendario-academico`, branch de publicação `main`.

O desenvolvimento usa `.env.local`, preparado por `pnpm dev:setup`. Na Vercel, Production usa:

```dotenv
VITE_CONVEX_URL=https://exuberant-cheetah-138.convex.cloud
VITE_CONVEX_SITE_URL=https://exuberant-cheetah-138.convex.site
```

`SITE_URL`, `JWT_PRIVATE_KEY`, `JWKS` e credenciais dos provedores pertencem ao ambiente Convex. Nunca use prefixo `VITE_` em segredo. Cada ambiente tem configuração de autenticação própria.

Vite gera `dist/app/index.html` e chunks. Vite, preview e Vercel encaminham somente os caminhos conhecidos do produto para essa entrada. `vercel.json` mantém headers de segurança, instalação com lockfile e build Node 24. O build Production confere as URLs Convex contra o destino versionado.

## Publicação antes da troca pública

`pnpm deploy:production` valida o código, constrói um candidato Production sem domínio público, publica somente expansões compatíveis do Convex e valida os dois frontends antes de promover o ID testado. Não entra em manutenção, não encerra sessões existentes e não restaura dados automaticamente.

Esse é o fluxo padrão para todo pedido de release, deploy ou publicação em produção. O modo rápido exige um pedido explícito de **fast release**; uma falha no fluxo normal não autoriza essa troca.

Pré-requisitos:

- `main` commitada e limpa, `origin` correto e permissão de push fast-forward e de reservar `codex/production-release-lock`.
- Conta administrativa Convex; nenhum seletor alternativo de deployment. `operations:status` deve estar disponível e sem manutenção.
- `VERCEL_TOKEN` no ambiente, com acesso ao projeto e permissão de criar/promover deployments e configurar atribuição de domínios. Segredos nunca entram em argumentos, logs ou Git.
- Conta operacional ADMIN local e calendário exclusivo de teste: `DENTEC_RELEASE_SMOKE_USER_ID`, `DENTEC_RELEASE_SMOKE_EMAIL`, `DENTEC_RELEASE_SMOKE_PASSWORD`, `DENTEC_RELEASE_SMOKE_CALENDAR_ID`. O calendário precisa estar salvo com a revisão institucional vigente.
- Chromium instalado com `pnpm test:browser:install`.
- Se o deployment estiver protegido, `VERCEL_OIDC_TOKEN` local e Trusted Sources autorizando desenvolvimento para produção no próprio projeto. A ferramenta não desativa proteção nem altera essa regra. A credencial segue somente no transporte até a origem imutável, sem propagação em redirecionamentos externos. Redirecionamentos HTTP são recusados durante o ensaio para não escapar do deployment fixado; sair da origem canônica também bloqueia o preenchimento do login. Requisições que falham nunca são substituídas pelo frontend público anterior.
- No primeiro uso, `DENTEC_RELEASE_BACKEND_COMMIT` deve conter o SHA comprovado do backend efetivamente instalado. O proprietário de uma manutenção não comprova publicação. Após a primeira expansão concluída, `releases:status` passa a fornecer o recibo persistido do backend.
- Quando o plano contém migrações, `DENTEC_RELEASE_BACKUP_DIR` deve apontar a uma pasta privada existente, absoluta e fora do repositório. O comando exporta os dados com Storage, confere o ZIP e grava seu SHA-256 e recibo antes de publicar o backend. O backup contém dados e credenciais: usar uma pasta com acesso restrito ao usuário. Ensaiar restauração conforme [Operações administrativas de dados](migracao-schema.md); a release nunca importa o backup.

### Credenciais locais em `.vercel/`

A pasta `.vercel/`, ignorada pelo Git e de acesso restrito ao usuário, guarda o estado local de operação. Não copie seu conteúdo para issues, logs, argumentos de comando ou commits.

- `release.env`: `VERCEL_TOKEN` da release, com permissão `600`. Use um token de acesso dedicado, criado em [Account Settings → Tokens](https://vercel.com/account/tokens) com escopo da equipe `dentec-proens` e do projeto `calendario-academico` e com expiração definida. Se a promoção do domínio for recusada com escopo de projeto, crie o token com a equipe e **All Projects**. O valor começa com `vcp_` e é mostrado uma única vez.
- `release-smoke.env`: variáveis `DENTEC_RELEASE_SMOKE_*` da conta e do calendário de smoke da release normal.
- `project.json`: vínculo do diretório ao projeto e à equipe na Vercel (`projectId`, `orgId`). Não é credencial.
- `cli/auth.json`: sessão da CLI da Vercel, quando criada com `vercel login --global-config .vercel/cli`. Expira em poucas horas; não a use como credencial de release.

Não guarde o `VERCEL_TOKEN` no `.env.local`. Esse arquivo seleciona o deployment Convex de desenvolvimento, é reescrito por `pnpm dev:setup` e por `vercel env pull`, e carregá-lo inteiro exportaria destinos de desenvolvimento para o processo da release.

As ferramentas de release só leem `VERCEL_TOKEN` e `DENTEC_RELEASE_SMOKE_*` do ambiente; elas não abrem esses arquivos. Carregue somente os arquivos de release no terminal que publica:

```sh
set -a; . ./.vercel/release.env; set +a
pnpm deploy:production:fast
```

Na release normal, carregue também `set -a; . ./.vercel/release.env; . ./.vercel/release-smoke.env; set +a` antes de `pnpm deploy:production`.

```sh
pnpm deploy:production --dry-run
pnpm deploy:production
pnpm deploy:production --resume
```

`--dry-run` não executa subprocessos nem chamadas remotas. A execução normal:

1. Confere Git/destinos, executa `pnpm check` e consulta contratos remotos pela Convex CLI. O destino é fixado em arquivo temporário explícito; tokens não são enviados como argumentos.
2. Quando há mudança de backend, lê `release/plan.json`, extrai a revisão anterior do Git e compara schemas, índices e funções públicas, internas e rotas HTTP. Os metadados remotos precisam corresponder ao baseline. Preserva autenticação, dependências de produção, componentes e runtime existentes.
3. Reserva a release por referência Git com `force-with-lease` esperando ausência. Confere que o domínio público continua no deployment anterior. Desativa e confirma atribuição automática de domínios; `vercel.json` também desativa auto-deploy por push. Envia o SHA exato e aguarda o candidato Production READY.
4. Abre uma sessão operacional antes do deploy. Se houver migração, cria primeiro o backup privado. Publica a expansão pelo Convex CLI, confere os contratos efetivamente instalados e registra o plano, SHA, fingerprints e proprietário em `releaseProgress`.
5. Confere que a mesma sessão continua válida. Executa as migrações em lotes de até 50 registros e depois uma passagem de verificação. Cada mutation grava os campos adicionados e o cursor na mesma transação; falha de um lote não avança seu checkpoint.
6. Carrega os arquivos da URL imutável do **frontend anterior** em um navegador isolado cuja origem é o domínio público canônico. Somente requisições dessa origem são encaminhadas ao deployment; requisições Convex, downloads externos e seus cabeçalhos `Origin`/CORS permanecem intactos. Executa login, consulta, salvamento `unchangedOnly` e PDF real contra o backend expandido e os dados migrados. Repete com os arquivos do candidato novo, sem trocar o domínio público para os usuários. O calendário precisa ser de teste e permanecer intacto; sessões e PDFs criados pelo smoke são operacionais. E2E continua proibido em produção.
7. Confere novamente código, contratos, reserva, plano e a sessão aberta antes do deploy. Marca o candidato validado e promove exatamente esse ID, sem reconstrução. Aceita o reconhecimento HTTP da promoção mesmo quando não há corpo JSON (por exemplo, 202 ou 204), mas somente conclui após consultar o ID testado no domínio. Mantém a configuração manual de domínios. Leituras e criação de deployments continuam exigindo JSON válido.
8. Confere a sessão após a troca, grava o recibo de conclusão, encerra somente sua sessão de conferência e remove a reserva com a identidade exata.

Releases apenas de frontend preservam o backend e não executam migração ou preparação de runtime. O backend continua compatível com as abas antigas pelos contratos conferidos; isso não comprova a retenção dos arquivos JavaScript e CSS antigos no domínio público. Push, build ou smoke novo isoladamente não autorizam promoção. A reserva protege execuções cooperantes deste comando; mudanças administrativas externas exigem reconciliação e são bloqueadas quando a divergência é detectada.

## Fast release

```sh
pnpm deploy:production:fast --dry-run
pnpm deploy:production:fast
```

Use somente quando houver pedido explícito de **fast release**. O comando publica o frontend e o backend em produção e omite `pnpm check`, lint, testes, build local, comparação de compatibilidade, backup e smoke de navegador. O typecheck padrão do Convex, seu empacotamento/validação de schema e a instalação/build remotos da Vercel continuam executando. O deploy usa `--codegen disable` para preservar os arquivos gerados do commit; mantenha-os atualizados durante o desenvolvimento.

Pré-requisitos: `main` commitada e limpa, `origin` correto, conta administrativa Convex, `VERCEL_TOKEN`, produção sem manutenção e nenhuma release pendente. O bootstrap usa o mesmo `DENTEC_RELEASE_BACKEND_COMMIT` comprovado do fluxo normal. A fast release dispensa Chromium, credenciais de smoke, calendário de teste e diretório de backup. Os comandos usam Node/Git, sem dependência de Bash.

O script confere os destinos versionados, Git e o recibo instalado, recusa migrações declaradas em `release/plan.json` e reserva a mesma referência exclusiva do fluxo normal. Envia o SHA para `main` por fast-forward e cria o deployment Production pela API Vercel. O build remoto precisa atingir READY antes do deploy Convex; o domínio continua na versão anterior até a promoção. O hook mínimo de destino da CLI confere a URL Convex resolvida antes da publicação. Nenhuma comparação estrutural ou semântica é feita neste modo: mudanças que dependam de migração devem seguir o fluxo normal. O bloqueio considera todas as migrações declaradas, inclusive as já aplicadas. Para voltar a usar fast depois de uma migração normal concluída e verificada, versione um plano sem migrações; não limpe o plano enquanto a migração estiver pendente.

Após o deploy Convex, consulta os metadados do destino e grava um recibo com `mode: fast`, fase `published`, SHA, proprietário, candidato, deployment anterior, hash dos metadados e `skippedValidations` identificando `check`, `smoke`, `compatibility` e `backup`. Esse hash identifica os metadados observados; não comprova compatibilidade. Promove imediatamente o candidato sem smoke, confirma seu ID no domínio público, conclui o recibo e libera a reserva. Não utiliza a fase `validated` nem fabrica um plano de expansão ou evidência de testes.

`releases:installed` fornece o último recibo de qualquer modo; o contrato original de `releases:status` permanece disponível para releases normais. A próxima release normal usa o SHA da fast release concluída como baseline do backend, mantendo todas as suas validações. Se houver mudanças posteriores de backend, atualize `release/plan.json` para esse baseline como em qualquer expansão normal.

Falhas preservam a reserva e o estado efetivamente publicado, sem rollback automático. Se houver erro de deploy, o backend pode já ter sido atualizado; se houver erro de promoção ou conclusão do recibo, o domínio pode já ter mudado. Confira os dois serviços, o SHA e o recibo antes de repetir ou liberar a reserva. A fast release não oferece `--resume`; a retomada automática normal também recusa recibos fast. Um recibo fast pendente exige reconciliação manual; depois de confirmar a promoção do candidato e a identidade do proprietário, `releases:fastComplete` pode concluir esse mesmo recibo de forma idempotente. Uma falha anterior ao registro do backend exige comprovar e reconciliar também qual código foi instalado.

### Recuperar falha entre o deploy Convex e o recibo fast

Mantenha a reserva e use o mesmo commit e candidato; não repita a publicação nem remova a reserva para contornar um recibo antigo. Todos os comandos Convex desta recuperação devem usar o destino de produção explícito, como no exemplo de `operations:status` abaixo.

1. Confira no histórico de deployments do Convex se a publicação `fast SHA_DO_COMMIT` concluiu e corresponde ao código desse commit. Compare também o resultado de `function-spec` com as funções desse código. Os metadados isolados não comprovam mudanças que preservam assinaturas. Se a publicação continuar ambígua, preserve a reserva e investigue antes de gravar recibos.
2. Consulte `releases:installed`. Se já existir um recibo fast do mesmo commit, proprietário e candidato, a chamada anterior pode ter gravado apesar da resposta perdida: preserve esse recibo e pule para o passo 4. Se o recibo ainda for o anterior e estiver concluído, confira seu SHA de backend (ou o bootstrap comprovado quando não há recibo), `operations:status` sem manutenção e o proprietário da reserva em `codex/production-release-lock`.
3. Consulte `function-spec` no destino confirmado e calcule `functionSpecHash` com a função `fingerprint` exportada por `scripts/release-contracts.ts`, usando o objeto JSON retornado. Chame `releases:fastPublished` com `commit` igual ao SHA comprovado instalado; `previousBackend` igual ao SHA do recibo anterior/bootstrap; `previousFrontend` igual ao ID anterior mostrado na saída; `owner` igual ao SHA da reserva preservada; `candidateId` igual ao candidato READY original; `functionSpecHash` calculado e `plan` igual ao conteúdo de `release/plan.json` daquele commit, sem migrações. A mutation recusa substituir outra release pendente ou um baseline divergente. Confirme o recibo `published` em `releases:installed` antes de prosseguir.
4. Confira na Vercel projeto, ambiente Production, SHA e estado READY do candidato original. Se o domínio ainda estiver no deployment anterior registrado, promova esse mesmo candidato e confirme seu ID no domínio; se já estiver no candidato, confirme a promoção existente. Um terceiro deployment no domínio exige investigação, sem sobrescrevê-lo automaticamente. Preserve a atribuição manual de domínios.
5. Chame `releases:fastComplete` com o mesmo `owner` e `candidateId`, confirme `releases:installed` em fase `complete` e só então remova a reserva por `force-with-lease` do proprietário exato, conforme a seção de recuperação abaixo. Nunca registre o backend antigo como se ainda estivesse instalado nem conclua o recibo antes de confirmar a promoção.

## Plano de expansão e migrações

`release/plan.json` é versionado junto com o código. `baseline` identifica a revisão anterior do backend, `strategy` deve ser `expand`, e a justificativa e os testes precisam sustentar quatro garantias: clientes antigos, escritores antigos, jobs agendados e sessões. O plano inicial desta automação adiciona somente suas tabelas/funções internas e não transforma dados de negócio.

A barreira estrutural aceita tabelas novas, campos opcionais e argumentos que continuam aceitando todas as entradas antigas. Recusa remoção de tabela, índice ou função, mudança de tipo/visibilidade, argumentos estreitados, retorno alterado e desativação de schemaValidation. Funções internas e callbacks são contratos de compatibilidade, inclusive para actions já iniciadas. Auth tables, usuários, convites, recuperação de senha, código de autenticação e componentes ficam preservados. Atualização de dependências/runtime requer procedimento próprio.

A comparação estrutural **não prova compatibilidade semântica**. Os testes declarados no plano devem cobrir requisições dos clientes antigos e os escritores durante o backfill; `pnpm check` os executa antes da publicação. Um campo opcional novo deve ter leitura com fallback e ser preservado/preenchido pelos escritores novos que atendem clientes antigos. Não mudar a interpretação de argumentos antigos sob o mesmo contrato.

Uma migração automática admite somente preencher um campo novo, opcional e ainda ausente. Exemplo, após adicionar esse campo ao schema e preparar leitores/escritores compatíveis:

```json
{
  "id": "campus-release-label-v1",
  "table": "campuses",
  "field": "releaseLabel",
  "source": { "kind": "copy", "field": "name" }
}
```

Também há `source: {"kind":"literal","value":"valor padrão"}` para string, número, boolean ou null. As tabelas permitidas estão no validator `convex/releases/plan.ts`; auth e sessões ficam excluídas. IDs não são remapeados, nenhum documento é removido e valores já existentes são preservados, inclusive edições concorrentes. Definições de migração publicadas não podem mudar sob o mesmo ID. A verificação exige o novo campo em todos os registros percorridos; uma fonte ausente ou violação de schema aborta o lote.

Transformações destrutivas, atualizações de valores existentes, mudanças de autenticação e conversões arbitrárias não são aceitas por essa automação. Usar plano administrativo específico com ensaio, conforme [Operações administrativas de dados](migracao-schema.md). Remoção de contratos e campos pertence a uma etapa posterior de **contract**, após comprovar que abas, actions e jobs antigos não dependem deles; não há sinalizador para ignorar a proteção.

## Retomada e recuperação

Falha de build ou incompatibilidade impede o deploy do backend. Falha posterior de sessão, lote, verificação ou smoke impede a promoção e mantém a expansão compatível instalada, seus dados e checkpoints. A reserva Git permanece para investigação. Nenhuma falha autoriza rollback automático de backend ou banco.

Com `releaseProgress` pendente, retomar **o mesmo commit e plano** com `--resume`. O comando substitui por CAS somente o proprietário anterior da reserva e transfere sua propriedade no Convex. Conserva os lotes concluídos e repete verificações e smokes; o proprietário antigo não pode continuar gravando checkpoints. Não republica o backend. Se a promoção já ocorreu e seu ID coincide com o candidato validado, confirma a publicação existente e conclui o recibo sem uma nova promoção.

Uma falha de conexão durante o deploy, antes de registrar a expansão, exige reconciliação manual: não é seguro presumir qual código está instalado. Também não retomar automaticamente uma release com recibo já concluído e falha apenas na limpeza da reserva. Conferir pela API/dashboard os IDs do domínio, candidato, backend e recibos, inclusive em timeouts de promoção. Alterações manuais com os mesmos validators podem não ser detectadas pelos metadados; recibos só certificam operações conduzidas por este procedimento.

Depois de reconciliar uma falha fora da retomada automática, conferir `git ls-remote origin refs/heads/codex/production-release-lock` e remover **somente o proprietário conferido** com `git push --force-with-lease=refs/heads/codex/production-release-lock:SHA_DA_RESERVA origin :refs/heads/codex/production-release-lock`. Nunca usar força sem condição de identidade. Para recuperar o frontend, promover apenas um deployment anterior validado e compatível com o backend instalado; não reconstruir um commit antigo presumindo equivalência de ambiente.

O arquivo da sessão de conferência é temporário e privado; o comando o remove ao terminar. Backup e recibos privados permanecem disponíveis para diagnóstico. Nenhuma credencial é registrada no recibo público de release.

## Falhas e manutenção

A manutenção é confirmada no backend. `operationalControl` identifica o commit responsável, e `operationalLeases` mostra actions aceitas que ainda não concluíram. A configuração emergencial `DENTEC_MAINTENANCE=1` também bloqueia novas alterações. Não considerar o tempo decorrido como término de uma action.

Os controles de manutenção permanecem disponíveis para intervenção planejada e recuperação de janelas anteriores; a release online não os aciona. Uma falha após uma pausa explícita mantém o bloqueio. Uma resposta perdida da CLI pode ocorrer após o commit da pausa ou da autorização de smoke; conferir o estado também nesses casos. A revogação do smoke é tentada mesmo quando sua autorização não teve resposta, e uma falha de limpeza preserva o diagnóstico original. Conferir o estado pelo destino explícito, por exemplo:

```sh
pnpm exec convex run operations:status '{}' --deployment exuberant-cheetah-138 --codegen disable
```

Antes de liberar, conferir o commit que possui a janela, as operações ativas, os contratos Convex, o deployment Ready e o domínio Vercel. Uma falha de conexão durante publicação pode ocorrer após o envio; consultar o destino antes de repetir. Se uma action foi interrompida sem liberar o lease, comprovar sua conclusão na plataforma e tratar o lease por procedimento administrativo revisado. Não apagar leases automaticamente por idade.

Cada action registra `Operational lease`, o ID do lease e sua operação no próprio log de execução. Para um lease pendente, localizar esse registro e conferir o evento terminal da mesma execução no Convex. Somente após comprovar o término, a função interna `operations:finish` pode receber o ID exato desse lease. Sem evento terminal ou prova da plataforma, manter o bloqueio e investigar; não inferir que a action terminou por ter ultrapassado uma duração esperada.

Se a falha aconteceu antes de qualquer tentativa de deploy, os contratos não foram substituídos. Depois de confirmar `operations:status` sem leases ativos e a janela do mesmo commit, `operations:resume` com esse commit reabre o acesso. Se houve tentativa de deploy com resultado incerto, conferir os dois artefatos antes de liberar.

Uma mudança de regras pode fazer o calendário operacional deixar de ser um no-op mesmo após um preflight válido. O smoke recusa gravar essa diferença. Para corrigir o registro, manter a janela pausada, usar `operations:authorizeSmoke` com o commit e o ID da conta operacional, entrar no portal com essa conta, conferir e salvar explicitamente o calendário de teste e executar `operations:endSmoke` com o mesmo commit. Retomar a operação planejada somente após essa conferência. A ferramenta não altera automaticamente calendários para obter aprovação do smoke.

O inventário da aplicação preserva os callbacks de `nativeFiles`. O componente de presença mantém sua versão fixada e seu ciclo próprio: heartbeat e disconnect continuam disponíveis durante manutenção e não alteram calendários, documentos ou acessos. Uma atualização desse componente exige conferir também seus jobs com `convex data _scheduled_functions --component presence` e `--component presence/batchWorker`, além de seu contrato de atualização; não está coberta por presumir que o inventário da aplicação inclui componentes.

A recuperação confere as revisões efetivamente instaladas de backend e frontend e mantém seus contratos compatíveis, IDs e dados. Importar backup exige análise específica: dados criados após a reabertura não podem ser descartados por um rollback automático. Depois de um período de manutenção, a função interna `nativeFiles:cleanupExpired` remove temporários vencidos em lotes e preserva arquivos consumidos.

## Backup e arquivos

Exportar Convex completo com `--include-file-storage` quando houver PDFs. Manter ZIP, recibos e credenciais em local privado, fora do Git. Ensaiar restauração integral em um deployment descartável antes de operar sobre dados compartilhados; importação isolada de tabelas pode quebrar referências.

A aplicação repõe um PDF indisponível pelo fluxo [Restaurar original](restauracao-de-originais.md), com conferência de hash. Operações sobre exportações usam a [ferramenta administrativa de dados](migracao-schema.md).

Os testes remotos exigem opt-in de deployment descartável ou do desenvolvimento atual autorizado, com destino verificado e registros exclusivos da suíte conforme a [Verificação](verificacao.md). Produção não recebe E2E. A release depende do `pnpm check` local, executado automaticamente pelo comando de publicação.

## Recursos operacionais de PDF

A preparação explícita de runtime gera recursos gzip das duas arquiteturas do Chromium fixado. A etapa usa os arquivos x64 da dependência verificada pelo lockfile e o pacote oficial ARM64 com SHA-256 fixado, converte no host e envia ao Convex Storage por funções internas. A configuração `DENTEC_CHROMIUM_RUNTIME` só é gravada após os uploads; a conferência exige os mesmos tamanhos e hashes dos metadados do Storage.

Mudanças de runtime fazem parte do plano específico de backend; a release online preserva a versão instalada. Valide as duas arquiteturas antes de trocar essa configuração. Não substitua o runtime de actions em andamento sem comprovar a compatibilidade. O comando requer rede para o GitHub e upload de arquivos ao Storage; não usa os fluxos de documentos institucionais. Recursos já conferidos são reutilizados. As actions baixam os recursos por URLs obtidas diretamente do Storage e verificam integridade e arquitetura antes da extração gzip; não executam descompressão Brotli.

## Registro da retirada de calendários anteriores

A retirada foi concluída em produção em 27/10/2026, com ensaio descartável, backup integral, manutenção, verificação dos dados e smoke do candidato antes da promoção. A manutenção foi encerrada e a reserva exclusiva liberada.

O executor temporário contract foi removido. `pnpm deploy:production` continua como publicação completa de expansões compatíveis; a fast release exige autorização explícita. O formato histórico dos recibos contract permanece legível para reconhecer o backend instalado e preservar a auditoria, sem comandos para repetir a retirada.

Backups, planos, journals e recibos da operação continuam preservados em diretórios privados `backup-*`. Não executar novamente esses artefatos contra um banco já migrado. O procedimento administrativo geral está em [Operações administrativas de dados](migracao-schema.md).

A limpeza posterior removeu também `releases:contractPublished`, `releases:contractValidated` e `releases:contractComplete` do código. Enquanto produção ainda estiver na revisão anterior, o verificador de expansão recusará essa remoção, inclusive de funções internas. Publicar essa limpeza exige uma operação contract controlada separada, antes da próxima expansão; não usar fast release para contornar a proteção. A atualização do desenvolvimento com esse código não altera o backend de produção.

## Identidade e passagem de versão no navegador

Cada invocação de build Vite gera uma identidade opaca, embutida no cliente e no `dist/app/version.json`. A mesma identidade acompanha o candidato promovido; não há anúncio antecipado no Convex nem mudança no procedimento de release. `/version.json` é JSON sem cache de navegador/CDN. O preview revalida o HTML estático em cada acesso, sem cache longo, como o domínio público observado; somente o shell público pode participar do cache de voltar/avançar do navegador. A observação no domínio canônico muda somente com sua promoção ou rollback. Comparar diferença de identidade permite reconhecer também o retorno a uma versão anterior.

A consulta é um sinal de disponibilidade, não uma prova de compatibilidade de backend nem autorização de descarte. A aplicação atualiza automaticamente somente num clique elegível do menu principal, com observação recente e trabalho resolvido na própria aba. A atualização manual usa a mesma proteção e consulta novamente o manifesto. Não há sincronização de rascunhos ou autorização de outra aba.

### Continuidade dos assets: evidência e limite

Leitura somente da configuração efetiva em 27/10/2026, com as credenciais locais de `.vercel/cli/auth.json` e os IDs de `.vercel/project.json`: o projeto `calendario-academico` usa `framework: vite`. A resposta de projeto não apresentou campos de Skew Protection ou retenção. Foram identificados o deployment público `dpl_7pKEWhrcH3eLVz9n8yzXzhp9KRcH` e o anterior `dpl_FJ5ifQUtTupFL6aZru1JEEn5RopH`, ambos READY. A URL imutável anterior respondeu 302 de proteção de acesso; a listagem de arquivos fonte pela API retornou 404. Nenhuma configuração foi alterada e nenhum deployment foi criado.

Essa leitura não comprova acesso ao JavaScript/CSS antigo e seus imports transitivos pelo domínio canônico, nem estabelece uma janela de retenção. A [documentação de Skew Protection](https://vercel.com/docs/skew-protection) exige integração compatível; o build Vite atual não injeta um ID de deployment nos imports. Não foi habilitado Skew Protection, cache longo para HTML/manifesto, cópia de assets anteriores nem infraestrutura adicional. A continuidade na CDN permanece **não confirmada**. A garantia local é a recuperação protegida e a preservação dos proprietários em falha de chunk, comprovadas em bundles de produção sintéticos.

Uma prova adicional deve identificar arquivos de um deployment anterior e consultar JS, CSS e imports transitivos no domínio canônico após uma promoção autorizada. Retenção do deployment isolada não comprova esse roteamento. Não executar deploy ou promoção só para produzir essa evidência sem autorização específica.
