# PostgreSQL de desenvolvimento e testes

Projeto autorizado: [`calendario-academico-testes` no painel Supabase](https://supabase.com/dashboard/project/uzhrjqjlhfhacbcmzguq), em São Paulo, separado do banco institucional. A aplicação acessa PostgreSQL pelo backend Node e o navegador continua chamando `/api/*`. As contas e sessões continuam sob o controle da aplicação; não houve migração para Supabase Auth.

## Estrutura atual

O schema operacional é `dentec`, com tabelas próprias para contas, campi, calendários, estados, períodos, eventos, versões, sessões, convites, recuperação, documentos, pareceres e auditoria. Colunas tipadas, índices e referências preservam as relações entre essas entidades. Campos legados desconhecidos ficam em propriedades tipadas para permitir exportação fiel; o schema operacional não contém colunas JSON ou JSONB.

A migração `migrations/20261022142451_relational_entities.sql` prepara esse schema, mantém RLS em todas as tabelas e configura a role restrita `dentec_test_app` quando ela já existe. Esse papel pode operar os dados da aplicação e a sequência de ordenação; não é proprietário das tabelas, não executa DDL, não administra roles e não possui `BYPASSRLS`. As políticas permitem o acesso somente ao backend; a API Node continua verificando usuário, perfil e campus em cada operação.

`PUBLIC`, `anon`, `authenticated` e `service_role` não recebem acesso ao schema ou às tabelas. Mantenha `dentec` fora dos schemas expostos da Data API. A chave secreta de Storage permanece somente no servidor e não concede acesso às tabelas privadas por essa API.

## Dados preservados e legado

O destino de desenvolvimento recebeu inicialmente 29 campi e 34 eventos institucionais. Em 22/10/2026 foi feita a cópia autorizada da produção DENTEC, incluindo 33 usuários, 60 calendários (30 ativos e 30 na lixeira), 699 versões, 13 históricos, 3 pareceres e 918 registros de auditoria. Os 29 campi e 34 eventos institucionais foram preservados. A cópia mantém os hashes das senhas e os demais dados existentes; a autenticação continua sendo a da aplicação.

A origem foi consultada somente para leitura, em uma fotografia consistente. A migração recompôs as versões completas por calendário e posição, validou as linhas exportadas, passou por importação e comparação integral em PostgreSQL descartável e foi gravada no destino em uma transação. A comparação depois do commit confirmou o mesmo estado. As somas de verificação da linha de produção e das 699 versões permaneceram iguais após a operação. O estado anterior dos testes e as exportações completas ficam em `data/migration-backups/production-copy-20261022/`, ignorado pelo Git e protegido por permissões de acesso.

Os 13 PDFs do bucket de produção ainda não foram copiados: o Storage da origem retorna HTTP 402 com `exceed_egress_quota`. As referências, metadados e análises dos históricos estão preservados nas tabelas novas; os bytes dos PDFs continuam pendentes. O ambiente de testes não deve apontar o Storage para a produção. A cópia dos arquivos precisa ser concluída quando o acesso de leitura ao bucket estiver disponível.

As migrações `20261022135919_bootstrap_dentec_private.sql` e `20261022140156_provision_test_backend_role.sql` pertencem à implementação anterior: uma linha JSONB em `dentec_private.app_state`, versões arquivadas e backups. Essas tabelas permanecem como arquivo histórico, sem leituras ou escritas pelo servidor atual. A migração `20261022143223_retire_legacy_runtime.sql` revoga o acesso da role de aplicação ao schema antigo após a importação conferida; não apaga as tabelas ou seus dados. Uma credencial administrativa separada continua necessária para consultar/importar esse arquivo.

Não execute as versões antiga e nova ao mesmo tempo após o corte, pois elas gravariam em estruturas distintas. A migração é explícita e não estabelece sincronização entre o legado e as tabelas atuais. Consulte [preservação, migração e backup](../docs/postgresql.md).

## Configuração local

O `.env` local ignorado pelo Git está configurado com `POSTGRES_URL` da role restrita do projeto de testes. Portanto, `pnpm run dev` e `pnpm start` usam esse PostgreSQL; não usam `data/database.json`. Sem conexão PostgreSQL válida ou sem o schema preparado, o servidor recusa a inicialização local com uma instrução de configuração.

O arquivo `.env.supabase-test`, também ignorado, contém `DENTEC_TEST_POSTGRES_URL` para a integração externa. Esse nome seleciona somente o banco da suíte de testes. O arquivo `.env` seleciona o banco usado normalmente pela aplicação. As credenciais ficam em arquivos protegidos com permissão `600`, sem senhas no histórico de migrações.

O bucket `dentec-private` foi criado como privado, aceitando somente PDFs até 8.000.000 bytes. Sem `SUPABASE_URL` e chave secreta no desenvolvimento, os PDFs permanecem no PostgreSQL em colunas binárias. Quando ambas são configuradas, novos uploads usam o bucket privado, preservando o acesso aos arquivos anteriores já importados. Produção exige esse par de configurações. Não use variáveis `VITE_*` para credenciais secretas.

Para preparar outra instalação, use `.env.example`, uma credencial administrativa em `DENTEC_MIGRATION_DATABASE_URL` e o nome de uma role de aplicação já provisionada em `DENTEC_DATABASE_ROLE`. `pnpm run db:migrate` prepara tabelas e acessos, reconhece o legado e confere a importação. O servidor usa somente `POSTGRES_URL` ou `DATABASE_URL`, sem criar tabelas no início. Não execute migrações ou testes contra o banco institucional sem o procedimento específico de preservação.

## Reproduzir e verificar

As migrações foram geradas com a CLI oficial Supabase, após conferir sua ajuda. Para alterar o schema, crie uma nova migração; preserve os arquivos já aplicados.

```sh
pnpm dlx supabase@2.121.0 migration new nome_da_alteracao
```

Testes locais usam PostgreSQL embutido PGlite descartável e não precisam de credenciais remotas:

```sh
pnpm test
```

Eles verificam entidades, colunas tipadas, preservação de versões e PDFs, importação/exportação, rollback, reabertura, autorização, RLS e bloqueio das roles da Data API. Os testes de migração exercitam a importação do formato anterior e recusam substituição silenciosa de dados existentes.

Para validar transações reais, concorrência, sessões compartilhadas e independência entre gravação de sessão e bloqueios de calendário no projeto separado:

```sh
pnpm run test:supabase
```

Esse comando carrega `.env.supabase-test`, usa a URL explícita de testes e limpa os registros sintéticos que cria. Não use credenciais do banco institucional. O schema precisa estar preparado antes do teste, que não executa DDL.

O helper explícito `scripts/lib/test-database-clone.mjs` é exclusivo da cópia para testes; o servidor não o utiliza. Ele exige identificação distinta de origem/destino, credencial restrita `dentec_test_app`, backup e hash esperado do destino. A preparação usa PGlite para reconstruir e conferir o grafo completo; a transferência insere linhas tipadas em lotes e recusa alterações concorrentes no destino. `test/test-database-clone.test.mjs` cobre essas guardas, rollback e preservação de versões, ordem e PDFs binários.

Depois de aplicar uma migração remota, confira tabelas, importação, RLS, permissões, índices e avisos dos Advisors. A confirmação local não substitui a conferência remota. Mantenha backup do PostgreSQL e dos objetos privados do bucket e teste a restauração antes do uso institucional.

Referências: [segurança da Data API](https://supabase.com/docs/guides/api/securing-your-api), [conexões PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres) e [changelog do Supabase](https://supabase.com/changelog).
