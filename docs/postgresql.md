# PostgreSQL: configuração, migração e continuidade

Desenvolvimento e produção usam o mesmo armazenamento relacional. `POSTGRES_URL` tem precedência sobre `DATABASE_URL`. As variáveis existentes no processo têm precedência sobre `.env`. Sem URL válida ou sem as tabelas preparadas, o servidor informa a configuração faltante; ele não cria um banco JSON e não retoma silenciosamente uma base antiga.

O schema privado `dentec` guarda entidades em tabelas independentes, com colunas tipadas, índices e referências entre as entidades principais. Períodos, eventos, versões e itens dos pareceres têm registros próprios. Campos legados desconhecidos e metadados variáveis de extração de PDF são preservados em propriedades tipadas; o schema operacional não contém colunas JSON ou JSONB.

## Preparar uma instalação

1. Use PostgreSQL local ou um projeto Supabase separado para desenvolvimento. Configure a URL da credencial restrita do backend em `.env`, conforme `.env.example`.
2. Prepare as tabelas com `pnpm run db:migrate`. Esse comando usa `DENTEC_MIGRATION_DATABASE_URL`, quando configurada, ou a URL PostgreSQL do ambiente. Informe em `DENTEC_DATABASE_ROLE` o nome da role restrita de aplicação já provisionada para conceder os acessos e políticas correspondentes. A credencial de migração precisa de DDL; a credencial do servidor precisa apenas dos acessos de aplicação. Não deixe a senha administrativa no ambiente de produção da aplicação.
3. No Supabase, mantenha o schema privado fora dos schemas expostos da Data API e sem acesso de `anon`, `authenticated`, `service_role` e `PUBLIC`. As políticas de RLS autorizam a role restrita do backend; a aplicação continua conferindo o usuário, o perfil e o campus em cada operação.
4. Execute `pnpm run dev`, ou `pnpm run build` e `pnpm start`. Na primeira instalação sem usuários, o código da administração aparece no terminal. Em produção são obrigatórios `DENTEC_SETUP_EMAIL`, `DENTEC_SETUP_CODE` com pelo menos 32 caracteres, origem pública HTTPS e as credenciais privadas do Storage.

Para usar outro arquivo de ambiente sem alterar `.env`, execute, por exemplo, `node --env-file=.env.desenvolvimento scripts/dev.mjs`. Esse arquivo também precisa declarar `POSTGRES_URL` ou `DATABASE_URL`. `.env.supabase-test` usa `DENTEC_TEST_POSTGRES_URL` exclusivamente para a suíte de integração e não seleciona automaticamente o banco da aplicação.

Para backend persistente, prefira conexão direta quando a rede oferecer IPv6; em IPv4 o Session pooler do Supabase é adequado. Para Vercel/serverless, use Transaction pooler. Migrações e backups preferem conexão direta ou Session pooler, com credencial de administração separada. O backend valida TLS para hosts Supabase e não usa prepared statements nomeados. Consulte a [documentação de conexões do Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Preservar uma instalação existente

Pare os processos da versão anterior antes do corte para que nenhuma alteração posterior fique somente na base antiga. Preserve uma cópia protegida do banco original e a versão do aplicativo que o utiliza. Não coloque arquivos de dados ou credenciais no Git.

Se a instalação anterior usa PostgreSQL com `dentec_private.app_state`, `pnpm run db:migrate` reconhece e migra o estado legado, incluindo versões arquivadas. Use uma credencial de migração que ainda possa ler as tabelas de origem. O estado original e as tabelas antigas permanecem preservados para conferência; no projeto Supabase de testes, o acesso da role de aplicação ao legado é revogado depois dessa conferência. Não inicie versões antigas e novas simultaneamente: depois do corte elas escreveriam em bases distintas dentro do mesmo PostgreSQL.

Se a instalação anterior usa arquivo JSON, prepare um destino vazio e importe explicitamente:

```sh
pnpm run db:migrate --import-json=data/database.json
```

Quando também houver estado PostgreSQL legado, essa opção faz a reconciliação explícita das duas origens antes da importação. Conflitos são rejeitados, sem substituir silenciosamente contas ou calendários. O importador verifica o resultado dentro da transação e não altera o arquivo original. Nunca use um arquivo de outra instalação para sobrescrever uma base com uso posterior. `pnpm run db:import arquivo.json` também pode ser usado quando o schema já foi preparado e ainda estiver vazio; executar `db:migrate` sem origens inicializa o catálogo e os campi padrão.

Depois do corte, confira login das contas existentes, lista de campi, calendários e datas, versões anteriores, pareceres e download dos documentos/PDFs. Em desenvolvimento, os PDFs antes embutidos no JSON continuam guardados no PostgreSQL; a importação não exige movê-los imediatamente para o Storage.

## Exportação e backup

```sh
pnpm run db:export /caminho/protegido/exportacao.json
```

A exportação completa contém dados de conta, sessões, documentos, snapshots e demais registros. Ela é criada com permissão restrita e deve ficar em local protegido. É um formato de portabilidade e conferência; o backup operacional deve incluir o PostgreSQL e os objetos privados do bucket, com testes de restauração. Uma exportação que referencia objetos no Storage não contém automaticamente os bytes desses objetos.

Antes de atualizar ou importar, faça backup da instalação atual. Restauração deve ocorrer em uma base separada para conferência, antes de substituir a base ativa. As migrações não apagam o arquivo JSON original nem as tabelas PostgreSQL legadas; preserve essas cópias até concluir a conferência e definir a retenção institucional.

## Verificação de desenvolvimento

`pnpm test` usa PostgreSQL embutido PGlite em bancos descartáveis para exercitar SQL, aplicação HTTP, autorização e persistência. Ele não precisa de credenciais de produção. `pnpm run test:supabase` usa a URL explícita de testes para validar PostgreSQL externo; utilize somente um projeto de testes separado. Os comandos de servidor nunca usam PGlite como fallback.
