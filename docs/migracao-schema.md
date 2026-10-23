# Consolidação do schema Convex

A aplicação usa documentos tipados, referências nativas e mutations por operação. A pasta `migration/` é uma ferramenta administrativa de uso único: não é importada por `convex/` nem pelo frontend. O codec antigo existe somente ali para ler os backups anteriores.

## O que é preservado

A migração substitui os documentos existentes com `ctx.db.replace`, mantendo `_id` e `_creationTime`. As referências de usuário, campus, calendário, parecer, documento e PDF histórico passam a apontar para esses IDs. Todas as tabelas administradas pelo Convex Auth e o Storage permanecem intocados. A conferência do backup verifica tamanho e SHA-256 dos bytes de cada arquivo, além de comparar seus metadados. As credenciais de autenticação não são reimplementadas nem recriadas.

Os snapshots de calendário continuam em `calendarSnapshots`; metadados em `calendarVersions` passam a referenciar o calendário diretamente. O histórico de pareceres também mantém cada documento. O estado histórico é tipado e conserva a representação salva na época, inclusive a antiga escolha de etapas e de férias. A identidade das referências históricas é traduzida, inclusive os IDs embutidos nas decisões de ignorar sugestões, sem recalcular eventos passados. As modalidades originais de cada PDF histórico também são preservadas, independentemente das modalidades atuais do calendário. `officialApproval: false`, que era uma constante do DTO, passa a ser derivado; a migração rejeita um registro com aprovação verdadeira em vez de descartá-lo.

O conteúdo atual é separado dos metadados do calendário. A organização atual de etapas passa a ser por modalidade; férias antigas são expressas como intervalos explícitos. A modalidade ambígua `tecnico` é preservada e não é adivinhada como integrado ou subsequente. Os eventos institucionais mantêm seu código semântico (`code`), usado pelas regras de calendário. Os IDs externos dos calendários anteriores ficam em `calendarAliases` para resolver links públicos antigos para o ID nativo, com a autorização aplicada ao calendário de destino. A base tem revisão por ano.

Os PDFs usam `storageId`. Quando o arquivo original não está no Storage, ficam os metadados, a análise já existente e `unavailableFile.sourceReference`, com motivo `not_migrated`. A migração não fabrica bytes. Na fotografia de produção de 23/10/2026 havia 14 PDFs históricos, 1 original no Storage e 13 originais ainda indisponíveis.

Sessões do banco JSON, limitadores antigos, uploads legados, `scopeVersions`, `rootFields` e `fileObjects` são esvaziados somente ao fim dos lotes. O backup integral conserva esses dados para restauração. As tabelas vazias podem continuar aparecendo no catálogo interno do Convex até sua remoção administrativa; não pertencem ao schema nem ao runtime da aplicação.

## Ferramentas e garantias

Execute o script com `node --import tsx scripts/migrate-data.ts`. Ele aceita seis operações:

- `plan`: lê um ZIP original com Storage e produz um plano determinístico em diretório privado ignorado pelo Git.
- `prepare`: cria um projeto Convex temporário com schema amplo e apenas funções internas de migração. Não publica nada.
- `apply`: verifica o deployment e o estado de origem, cria outro backup com Storage, executa lotes limitados e mantém checkpoint transacional.
- `verify`: exporta novamente o deployment explícito com Storage, compara todos os registros contra os fingerprints esperados, IDs, datas de criação e Auth e valida o schema final. Registra o digest do snapshot e do schema no checkpoint desse mesmo destino e gera o recibo privado. `--snapshot` é o caminho de saída de um novo backup, não um arquivo preexistente.
- `finish`: consulta o checkpoint no destino explícito, exige o plano completo e a verificação registrada para os mesmos digests do recibo e remove o checkpoint temporário antes da publicação final.
- `validate`: confere um ZIP existente offline; não emite recibo que autorize a migração de produção.

Cada lote e o plano completo têm digest SHA-256. Um retry do último lote confirmado não repete inserções; um lote fora de ordem ou outro plano é rejeitado. A gravação dos documentos e o checkpoint acontecem na mesma transação. Em caso de conexão perdida, repetir `apply` com o mesmo plano retoma o checkpoint. Não se deve executar importações, publicações ou outro plano para tentar resolver uma falha de conexão sem conferir o estado.

Arquivos ainda embutidos como base64 bloqueiam o planejamento: seus bytes precisam ser transferidos e conferidos no Storage antes da consolidação. A conferência de origem também rejeita tabelas não previstas que contenham dados.

O script não aceita sobreposições de credenciais/destino no shell. Em `--deployment local`, lê a credencial local sem exibi-la e força `http://127.0.0.1:<porta>`; a CLI 1.47 não resolve corretamente `--deployment local` para alguns deployments anônimos. Em produção, exige `--rehearsal` com recibo de outro deployment para o mesmo plano e schema. O recibo de integridade dos dados complementa os testes dos fluxos e a revisão do código; não os substitui.

## Ensaio em um backend descartável

1. Exporte a produção pelo nome explícito configurado em `config/environments.ts`:

   ```sh
   mkdir -m 700 backup-schema
   pnpm exec convex export --deployment exuberant-cheetah-138 --include-file-storage --path backup-schema/original.zip
   chmod 600 backup-schema/original.zip
   node --import tsx scripts/migrate-data.ts plan --snapshot backup-schema/original.zip --out backup-schema/plan.json
   node --import tsx scripts/migrate-data.ts prepare --plan backup-schema/plan.json --out backup-schema/rehearsal
   ```

2. Inicie um Convex local anônimo no diretório `backup-schema/rehearsal` e mantenha o processo aberto:

   ```sh
   CONVEX_AGENT_MODE=anonymous node ../../node_modules/convex/bin/main.js dev --typecheck disable --codegen disable
   ```

   Confira somente os identificadores públicos: `anonymous:*`, URL `http://127.0.0.1:*` e porta local. Nunca imprima a chave administrativa nem o arquivo de configuração inteiro.

3. Restaure o ZIP completo original no backend local. Em um backend descartável vazio, a criação antecipada das tabelas do schema pode reservar números incompatíveis com o snapshot. Nesse caso, a restauração isolada usa `--replace-all`, pois não há componentes ou dados a preservar nesse destino. Esta opção não faz parte da migração de produção:

   ```sh
   cd backup-schema/rehearsal
   CONVEX_AGENT_MODE=anonymous node ../../node_modules/convex/bin/main.js import ../original.zip --replace-all --yes
   cd ../..
   ```

4. Execute o plano, fornecendo o digest exibido por `plan`:

   ```sh
   node --import tsx scripts/migrate-data.ts apply --plan backup-schema/plan.json --deployment local --project backup-schema/rehearsal --confirm DIGEST_DO_PLANO
   ```

5. Gere uma nova exportação do próprio backend local, confira os dados e emita o recibo:

   ```sh
   node --import tsx scripts/migrate-data.ts verify --plan backup-schema/plan.json --snapshot backup-schema/after.zip --deployment local --project backup-schema/rehearsal --out backup-schema/rehearsal-receipt.json
   ```

6. Remova o checkpoint do ensaio depois de preservar o recibo:

   ```sh
   node --import tsx scripts/migrate-data.ts finish --plan backup-schema/plan.json --deployment local --project backup-schema/rehearsal --receipt backup-schema/rehearsal-receipt.json
   ```

   Publique o backend final no mesmo ambiente descartável e valide os fluxos completos com a cópia de produção: autenticação e escopo, leitura/edição concorrente, recuperação de versão, parecer e revisões, base institucional por ano, arquivos disponíveis e indisponíveis, exclusão/restauração e logs. Escritas sintéticas pertencem ao ensaio.

7. Execute `pnpm check` e o code review solicitado com Claude Code CLI; trate os achados pertinentes antes da produção. Se o schema mudar, regenere o recibo com o schema final e repita os fluxos afetados.

## Aplicação em produção

A consolidação exige uma janela de manutenção: o projeto temporário substitui as funções da aplicação por funções internas, impedindo alterações concorrentes durante a mudança de formato. Essa publicação deve usar um arquivo de ambiente com destino explícito e a conferência de URL do fluxo institucional. Não se deve publicar o schema final diretamente sobre os documentos antigos.

Depois de publicar o backend de manutenção, confira novamente o destino efetivo e faça um backup completo atual. Se os dados mudaram desde a fotografia ensaiada, `apply` recusa os fingerprints. Nesse caso, gere novo plano e repita o ensaio com a fotografia atual. Não desative essa proteção.

Com o mesmo plano ensaiado e o ambiente em manutenção:

```sh
node --import tsx scripts/migrate-data.ts apply --plan backup-schema/plan.json --deployment exuberant-cheetah-138 --project backup-schema/production-maintenance --confirm DIGEST_DO_PLANO --rehearsal backup-schema/rehearsal-receipt.json
```

Execute `verify` para exportar e conferir diretamente o destino de produção:

```sh
node --import tsx scripts/migrate-data.ts verify --plan backup-schema/plan.json --snapshot backup-schema/production-after.zip --deployment exuberant-cheetah-138 --project backup-schema/production-maintenance --out backup-schema/production-receipt.json
```

Execute `finish` com o recibo de produção para remover o checkpoint. Só então publique o schema e as funções finais, mantendo a manutenção até o frontend correspondente estar pronto. Valide os acessos e leituras reais sem criar dados sintéticos em produção. Execute uma vez a mutation interna `nativeFiles:cleanupExpired` para retomar a limpeza de temporários vencidos durante a manutenção. Guarde os dois backups, o plano, os recibos e os logs em local privado.

Se houver divergência de contagem, referência, fingerprint, arquivo, histórico ou schema, interrompa a publicação final. Não apague registros para fazer a validação passar. Enquanto o backend estiver em manutenção, a restauração do ZIP original completo pelo mesmo deployment recupera os IDs, o Auth e os arquivos; restaure também o backend/frontend do mesmo commit anterior antes de reabrir o acesso. Depois da reabertura, novos dados tornam necessária uma análise de conciliação antes de qualquer rollback destrutivo.

A [documentação oficial de importação](https://docs.convex.dev/database/import-export/import) confirma a preservação de `_id`/`_creationTime` e Storage em restaurações ZIP. O ZIP exportado é utilizado sem edição manual; a transformação é feita por mutations no deployment de ensaio e depois, com as mesmas garantias, em produção. O schema final volta a aplicar a [validação estrita do Convex](https://docs.convex.dev/database/schemas).

## Ciclo de vida do codec legado

`migration/legacy-codec.ts` lê o envelope antigo (`data` e `undefinedPaths`), restaura chaves escapadas e preserva a distinção entre propriedades ausentes e propriedades com `undefined`. O único consumidor operacional é `migration/plan.ts`, chamado por `scripts/migrate-data.ts plan`. O encoder é usado somente nas fixtures dos testes de migração. Não há importação do codec no frontend nem nas funções Convex da aplicação.

A migração para o schema nativo já possui recibos locais de `verify` com `result: verified` e `verificationMode: live_export`: produção (`exuberant-cheetah-138`, 23/10/2026 às 13:40 UTC) e desenvolvimento do Gustavo (`oceanic-gazelle-652`, às 14:09 UTC). Esses recibos registram a verificação daquela fotografia; não substituem uma conferência atual dos destinos. Os caminhos privados são `backup-convex-schema-20261023/release-8ea551e/backup-migration/production-receipt.json` e `backup-dev-presence-20261023/receipt.json`. Não versionar esses backups nem seus dados.

O codec permanece no repositório para permitir ler os backups anteriores, repetir um ensaio e recuperar uma instalação que ainda esteja nesse formato. Sua remoção exige encerrar esse suporte:

1. Confirmar que todos os deployments ainda utilizados estão no schema nativo, com a migração concluída e seus checkpoints removidos. Os recibos encontrados cobrem produção e um desenvolvimento, não todas as instalações possíveis.
2. Preservar os backups, planos, recibos e uma referência Git recuperável da ferramenta anterior (por exemplo, o commit `8ea551e`) em local privado. Decidir que a recuperação de backups antigos será feita por essa versão arquivada, ou converter e verificar os backups que ainda precisarão ser lidos pela versão atual.
3. Retirar conjuntamente `migration/`, `scripts/migrate-data.ts`, o comando `migrate:data`, os testes exclusivos dessa conversão e as instruções de execução da ferramenta. Excluir apenas o codec deixaria a operação `plan` quebrada.

Os 13 PDFs originais indisponíveis **não impedem a retirada do codec**: seus registros já estão no schema nativo, com `unavailableFile`. A reposição depende de obter os bytes originais com o SHA-256 esperado e usar [Restaurar original](restauracao-de-originais.md), sem passar pelo envelope antigo. A compatibilidade das representações históricas e dos rascunhos importados também é independente deste codec; não deve ser removida junto com a ferramenta administrativa.
