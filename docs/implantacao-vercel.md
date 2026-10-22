# Implantação: GitHub e Vercel

O portal usa React, Vite e Lucide. Portal, editor e API são servidos pelo backend Node. Desenvolvimento e produção usam PostgreSQL; publicar exige preparar e conferir o banco de destino e o armazenamento privado de PDFs.

## Repositório e build

Versionar código, testes e documentação. Excluir banco, PDFs enviados, configurações secretas e logs. `npm ci` instala as dependências e `npm run build` gera `dist/portal/portal.html`, os arquivos JavaScript/CSS com hash e o manifesto Vite. A pasta `dist/` não é versionada.

`vercel.json` mantém explicitamente o preset `node` e executa `npm run build`. Os arquivos de `dist/portal/**` são incluídos no pacote de `server.mjs`. O servidor atende `/` e `/assets/*`, preservando `/api/*`, `/editor`, `/ativar`, `/recuperar-senha` e `/logs`. O backend Node atende autenticação, autorização e dados; o diretório gerado pelo Vite contém apenas o portal. A política de conteúdo exige scripts e estilos da própria origem.

## Banco e dados existentes

O servidor usa `POSTGRES_URL` ou `DATABASE_URL`, tanto localmente quanto na Vercel. O schema privado `dentec` contém tabelas por entidade. Contas, sessões e limites de tentativas são compartilhados entre instâncias. Alterações usam transações e preservam as verificações de versão e isolamento por campus.

Execute `npm run db:migrate` antes da publicação, com uma credencial separada em `DENTEC_MIGRATION_DATABASE_URL` que possa preparar o schema e ler o legado quando necessário. Informe `DENTEC_DATABASE_ROLE` com o nome da role de aplicação já provisionada para configurar os acessos e políticas. A credencial usada pelo servidor deve ser restrita aos acessos de aplicação e às políticas de RLS. O servidor não executa DDL e responde 503 se o banco não estiver preparado. Não use armazenamento temporário da plataforma como banco permanente.

Para migrar a antiga linha `dentec_private.app_state` ou importar `data/database.json`, consulte [o procedimento de preservação](postgresql.md). Originais não são apagados. Pare escritores antigos durante o corte e confira o resultado antes de liberar acesso. Não execute a aplicação antiga simultaneamente após a migração: ela continuaria escrevendo no estado legado.

O schema da aplicação é privado, sem acesso por `PUBLIC`, `anon`, `authenticated` ou `service_role` da API Supabase, e com RLS para a role restrita do backend. O frontend fala com a API Node e nunca recebe a credencial PostgreSQL nem chaves secretas do Storage.

## Variáveis de produção

- `POSTGRES_URL` (ou `DATABASE_URL`): credencial restrita de aplicação. Na Vercel/serverless, use a conexão Transaction pooler do Supabase; o backend não usa prepared statements nomeados.
- `SUPABASE_URL` (ou `NEXT_PUBLIC_SUPABASE_URL`) e `SUPABASE_SECRET_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY`): somente servidor.
- `DENTEC_SETUP_EMAIL`: e-mail institucional da primeira administração.
- `DENTEC_SETUP_CODE`: segredo de pelo menos 32 caracteres.
- `DENTEC_PUBLIC_URL`: origem HTTPS pública estável; na ausência, a Vercel fornece o domínio de produção ou de deployment.
- `RESEND_API_KEY` e `DENTEC_MAIL_FROM`: necessários para o envio da recuperação de senha.

Sem a configuração obrigatória completa, o servidor responde 503 e não permite criar contas. Login Google permanece desativado na Vercel; senha e convite mantêm os meios previstos. O segredo de instalação não recria uma administração se o banco já tiver contas.

## Documentos e PDF

O bucket `dentec-private` precisa ser privado. Uploads recebem autorização temporária vinculada ao usuário e ao destino; o conteúdo PDF é verificado antes de registrar o documento. Downloads são autorizados no servidor e usam links de um minuto. Não torne documentos públicos para contornar limites de upload.

A validação da privacidade do bucket ocorre na operação com arquivos. Falhas do Storage não bloqueiam login ou edição de calendários quando o PostgreSQL está disponível. PDFs antigos importados continuam acessíveis no banco até uma migração de arquivos explícita; novos uploads em produção usam o Storage. A exportação de PDF usa Chromium compatível com Linux da hospedagem.

## Verificação antes de liberar o uso

1. Executar build e suíte de testes; os testes locais usam PGlite descartável com SQL real. A integração PostgreSQL externa usa somente um banco de testes explícito.
2. Conferir migração, contas existentes, calendários e snapshots anteriores; validar duas instâncias concorrentes e conflitos de versão.
3. Na implantação, verificar login, convites, recuperação, separação de campi, upload/download, geração de PDF e persistência após nova publicação.
4. Conferir carregamento de JavaScript/CSS e navegação portal → editor → portal. A ausência do build resulta em 503 com instrução para compilá-lo.
5. Configurar backup de PostgreSQL e objetos privados e testar restauração antes do uso institucional. Definir também retenção e limpeza de uploads incompletos.

As instruções não publicam a aplicação nem contratam recursos. O plano gratuito não oferece garantia de disponibilidade permanente.

Referências: [conexões PostgreSQL do Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), [limites de Functions](https://vercel.com/docs/functions/limitations) e [runtime Node.js](https://vercel.com/docs/functions/runtimes/node-js).
