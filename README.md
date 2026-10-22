# Assistente de Calendários Acadêmicos DENTEC/PROENS

Portal em React + Vite, com ícones Lucide. O editor de calendário continua em JavaScript modular, usando as mesmas APIs e dados.

## Iniciar sem confusão de pastas

1. Instale Node.js 24 LTS (mínimo aceito: 22.13) e execute `npm ci` na pasta que contém `package.json`.
2. Copie `.env.example` para `.env` e configure `POSTGRES_URL` (ou `DATABASE_URL`) de um PostgreSQL de desenvolvimento, local ou Supabase. A credencial de aplicação precisa acessar as tabelas da instalação. O aplicativo usa PostgreSQL também fora da Vercel; sem a conexão ele informa o erro e não inicia.
3. Em uma instalação nova, configure a credencial administrativa em `DENTEC_MIGRATION_DATABASE_URL`, informe em `DENTEC_DATABASE_ROLE` a role restrita de aplicação já provisionada e execute `npm run db:migrate` para preparar as tabelas e os acessos. O servidor não cria tabelas nem executa migrações com a credencial de aplicação. Para preservar uma instalação anterior, siga primeiro [a migração de dados](docs/postgresql.md).
4. No Windows, dê dois cliques em INICIAR.cmd. Ele compila o portal e inicia o servidor. Mantenha a janela aberta e acesse http://127.0.0.1:4173.
5. Enquanto não houver usuários, copie o código exibido no terminal para criar a primeira administração. Cadastre seu nome, e-mail @ifpr.edu.br e uma senha própria do aplicativo com pelo menos 12 caracteres. Não use a senha institucional do IFPR. Contas importadas mantêm suas senhas e dispensam esse cadastro.

No VS Code, também é possível abrir a pasta que contém package.json e executar:

```powershell
npm.cmd run dev
```

`npm run dev` compila o portal com Vite antes de iniciar o servidor e recompila os componentes quando forem alterados. Recarregue o navegador para ver as mudanças. Portal, API e editor continuam na mesma origem e porta; nenhuma configuração de cookies ou CORS é necessária. Encerre com Ctrl+C.

Para executar uma versão compilada:

```sh
npm run build
npm start
```

O build grava somente o portal em `dist/portal/`; esse diretório é gerado e não deve ser versionado. Após mudar os componentes, execute o build novamente antes de `npm start`. Sem o build, o portal mostra um erro 503 com a instrução para compilá-lo. Se houver conflito de porta, encerre a versão anterior com Ctrl+C. Para verificar o código, execute `npm test`.

## Usar como ADMIN

- A lista de campi da imagem já vem cadastrada, incluindo Foz do Iguaçu. Em Campi e contas, cadastre unidades adicionais e contas CAMPUS vinculadas à unidade correta.
- Em Base institucional, confira os feriados e eventos de 2027. Cadastre novos eventos ou edite os existentes, indicando fonte, datas, ofertas e efeito na contagem. Um evento comemorativo não deve ser marcado como exclusão automaticamente.
- A base central é compartilhada por todas as contas desta instalação. Não é preciso recadastrar seus eventos em cada calendário. Reabrir um calendário incorpora a revisão mais recente; o sistema impede salvar usando revisão desatualizada.
- Em Calendários, selecione campus, ano, oferta, regime, nome do calendário e cursos. Turmas e turnos são opcionais. Ofertas ou organizações diferentes devem ter registros separados.

## Usar como CAMPUS

- Entre com a conta cadastrada pelo ADMIN. Você só verá a unidade autorizada.
- Crie ou abra seu calendário. As datas centrais serão carregadas pelo sistema.
- Envie o PDF do ano anterior na seção Calendário anterior do campus, com observações sobre o que precisa ser mantido ou revisto. O arquivo fica vinculado àquele campus, calendário e oferta. Limite: 8 MB por PDF.
- Selecione os sábados por mês na seção Sábados letivos por mês, indique atividade e fonte e confirme. Datas fora dos períodos não podem ser selecionadas; conflitos com feriados/recessos não contam como dias letivos.
- Configure a semana letiva e os períodos. Acrescente feriados municipais e eventos locais com fonte. Cada campo precisa ser aplicado pelo respectivo botão antes de salvar.
- Clique em Salvar no sistema para gravar uma versão. Baixar cópia gera um JSON dos dados locais; a base institucional continua sendo controlada pelo ADMIN. Importação JSON requer campus, ano e oferta compatíveis.
- Na aba Calendário anual, consulte a grade com tabela de eventos baseada na estrutura do modelo PROENS. Salve antes de imprimir. Clique em Baixar PDF para baixar o documento diretamente. Requer Chrome ou Edge no computador do servidor (Chrome é usado preferencialmente). Imprimir continua disponível.

## Onde os dados ficam

PostgreSQL é o banco de desenvolvimento e produção. Contas, sessões, campi, calendários, eventos, versões, pareceres, documentos e auditoria ficam em tabelas próprias no schema privado `dentec`. A conexão é configurada explicitamente e não depende da variável `VERCEL`. Não existe fallback para arquivo JSON. Computadores apontados para o mesmo banco compartilham a mesma instalação; utilize bancos separados para testes e dados institucionais.

Em desenvolvimento, sem credenciais de Storage, os PDFs ficam no PostgreSQL. Ao configurar `SUPABASE_URL` e uma chave secreta do servidor, novos arquivos usam o bucket privado `dentec-private`; PDFs importados que já estavam no banco continuam disponíveis. Produção exige esse armazenamento privado. Não configure chaves secretas em `VITE_*` ou nos arquivos de `web/`.

Arquivos JSON servem para importação/exportação e migração de instalações antigas. O servidor não abre nem modifica `data/database.json`. Preserve esse arquivo como cópia original até conferir a migração; copiar a pasta `data` deixou de ser o procedimento de backup da instalação em uso. Veja [migração, exportação e backup](docs/postgresql.md).

O código do primeiro ADMIN aparece apenas enquanto não há usuário cadastrado. Depois, use o login normal. As sessões expiram após oito horas, permanecem no PostgreSQL entre reinícios e são revogadas pelas ações de segurança existentes. Recuperação de senha depende do remetente e chave de envio configurados no servidor; consulte [o procedimento de recuperação](docs/recuperacao-de-senha.md).

## O que esta versão não faz ainda

- A execução de desenvolvimento aceita conexões HTTP somente no próprio computador. Acesso remoto exige uma implantação HTTPS e a configuração de produção descrita em [implantação](docs/implantacao-vercel.md). Copiar o ZIP não copia o PostgreSQL nem os arquivos do Storage.
- Não integra o login do IFPR. O domínio do e-mail não é verificado por um provedor institucional.
- Não extrai automaticamente dados do PDF histórico. Ele pode ser baixado e consultado; as datas não são copiadas para o ano novo.
- Não pesquisa nem confirma feriados municipais automaticamente. O PDF comercial de Foz recebido é uma pista, não prova oficial de aplicabilidade.
- Não valida o checklist completo, horas, todos os eventos condicionais, atas e trâmites. A contagem não concede aprovação institucional.
- Inclui a logomarca extraída do modelo, as dez cores da legenda e tabelas duplas de eventos. A paginação se adapta ao conteúdo e pode diferir do modelo vazio. Não gera Excel. Requer conferência final da DENTEC.

Veja docs/entrega-v03.md para fontes, verificações e limitações técnicas. docs/especificacao.md e docs/api.yaml são a especificação inicial e o contrato proposto de produção, não uma descrição exata de todos os endpoints locais implementados nesta versão.

## PDF e cores (v05)

O botão Baixar calendário em PDF fica no topo do editor e também na aba Calendário anual. Salve no sistema antes do download. Eventos locais têm Categoria e cor PROENS, independente do efeito na contagem. Eventos já registrados podem ter sua categoria corrigida na lista, mantendo as datas e a fonte. A administração dispõe das mesmas categorias na base institucional. Categorias simultâneas aparecem como pequenas faixas adicionais na célula, preservando a identificação do feriado/recesso. Férias, formação e conselhos precisam de datas fornecidas pelo campus; não são inventados.

## Novos administradores (v06)

Em Campi e contas > Criar conta de acesso, um ADMIN pode escolher ADMIN · Equipe DENTEC/PROENS ou CAMPUS · Apenas sua unidade. ADMIN não é vinculado a um campus: acessa todos os calendários, a base institucional e a criação de contas. CAMPUS exige uma unidade válida. O servidor rejeita criação por usuários CAMPUS, perfis desconhecidos e e-mails duplicados. Nenhuma conta real é criada pela atualização. As contas existentes continuam compatíveis. O recurso não implementa a emissão formal de pareceres nem aprovação oficial.

Validação: 18 testes passaram, incluindo criação de segundo ADMIN, login, acesso a todos os campi, acesso ao calendário de um campus e bloqueio de criação de ADMIN por conta CAMPUS.


## Base documental — v11

Em **Base institucional**, o ADMIN pode enviar PDFs por ano, conferir e definir a versão vigente de resolução, calendário de referência e parecer. Arquivos anteriores ficam preservados. Campi consultam os documentos publicados. Consulte `docs/base-documental-v11.md` para atualização, limites de análise e backup.
