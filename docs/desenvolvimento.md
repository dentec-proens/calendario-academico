# Desenvolvimento

Usamos um único projeto Convex, `calendario-academico`, no team `diretoria-de-ensino-tecnico-proens`. Cada desenvolvedor usa sua própria conta e seu deployment de desenvolvimento. O frontend local se conecta a esse deployment. Produção é compartilhada e fica separada.

## Primeira preparação

Tenha Node.js 24, pnpm 12.15.0 e acesso ao repositório e ao projeto Convex da Dentec. Na pasta do checkout:

```sh
pnpm install --frozen-lockfile
pnpm dev:setup
pnpm env:doctor
```

Sem `.env.local`, a preparação solicita login Convex e seleciona o desenvolvimento do usuário atual no projeto da equipe. Os destinos públicos vêm de [`config/environments.ts`](../config/environments.ts). Havendo uma configuração local, ela é mantida e validada; a preparação não troca o destino automaticamente.

`.env.local` é individual e não entra no Git. Não o copie de um colega. O deployment `oceanic-gazelle-652` já configurado por Gustavo deve continuar intacto; um novo desenvolvedor usa o seu. `pnpm env:doctor` confere a coerência da seleção e das URLs locais, sem chamadas remotas; não consulta a identidade ou as permissões da conta Convex.

### Primeiro acesso a um desenvolvimento vazio

`pnpm dev:setup` publica o código no seu desenvolvimento e prepara autenticação. Gera `JWT_PRIVATE_KEY` e `JWKS` somente quando ambos estão ausentes; se o par estiver incompleto, interrompe a preparação. Define `SITE_URL` para o endereço local somente quando essa variável ainda não existe. As chaves permanecem no ambiente Convex.

Em uma base completamente vazia, a preparação cria campi, catálogo e coleções iniciais. Havendo dados, não os sobrescreve. Ela não importa contas, calendários ou documentos de produção.

Se ainda não há usuários, o terminal mostra um código privado de instalação. Execute `pnpm dev`, abra o portal e preencha **Nome**, **Código de instalação**, seu **e-mail @ifpr.edu.br** e uma **senha própria** para criar o primeiro ADMIN. Esse código só permite a instalação antes do primeiro usuário; não o coloque no Git. Depois, esse ADMIN pode criar contas de teste pelo portal. Não há usuário ou senha fixos no código.

Um desenvolvimento já preparado, como o de Gustavo, mantém seus dados e sua autenticação; não repita uma importação para começar a trabalhar.

## Trabalho diário

```sh
pnpm dev
```

Esse comando acompanha funções Convex e inicia o Vite em http://127.0.0.1:4183. Alterações no frontend aparecem automaticamente; alterações no backend vão para seu desenvolvimento. Ctrl+C encerra ambos. Os dados de um desenvolvedor não são compartilhados com o outro nem com produção.

Use dados de teste no seu ambiente. As contas do portal são distintas das contas usadas para administrar Convex e GitHub. Google é opcional; login local permite trabalhar sem configurar esse provedor.

Antes de compartilhar código, execute `pnpm check`. Para conferir o build local, use `pnpm build` e `pnpm start`. Esses comandos não publicam nem importam dados. Os 13 PDFs históricos pendentes ficam para uma migração específica futura.

Para alterações visuais, consulte os [componentes compartilhados da interface](componentes-interface.md).

## TypeScript

Todo o código manual usa `.ts` ou `.tsx`, incluindo as regras compartilhadas em `src/`, os painéis React e a ferramenta administrativa em `migration/`. A configuração base usa `strict: true` e `allowJs: false`; os comandos de tipos e lint abrangem também esses módulos. As entradas de JSON e `FormData` são validadas antes de entrar nos contratos tipados.

Os arquivos JavaScript restantes são gerados: `convex/_generated/api.js`, `convex/_generated/server.js` e `src/native-print-assets.mjs`. Este último é produzido por `scripts/print-assets.ts` e possui uma declaração de tipos adjacente. Não editar os arquivos gerados manualmente. Os `.mjs` importados de PDF.js pertencem à dependência externa.

## Compartilhar e publicar

Os dois desenvolvedores podem enviar código para `main` e publicar diretamente; branches são opcionais e PR não é obrigatório. Atualize seu checkout antes de integrar mudanças do colega e combine a publicação para evitar duas atualizações simultâneas.

Para publicar funções e portal, use [`pnpm deploy:production`](implantacao-convex-vercel.md). Enviar `main` isoladamente aciona somente o build do portal na Vercel; não substitui a publicação das funções Convex.
