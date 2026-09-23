# Assistente de Calendários Acadêmicos DENTEC/PROENS

Versão 0.5 — contas locais, base institucional compartilhada e histórico por campus.

## Iniciar sem confusão de pastas

1. Extraia o pacote v05 em uma nova pasta.
2. Na pasta extraída, dê dois cliques em INICIAR.cmd.
3. Mantenha a janela aberta e acesse http://127.0.0.1:4173.
4. Na primeira execução, copie o código exibido no terminal para o formulário de criação da administração. Cadastre seu nome, e-mail @ifpr.edu.br e uma senha LOCAL com pelo menos 12 caracteres. Não use a senha institucional do IFPR.

No VS Code, também é possível abrir a pasta que contém package.json e executar:

```powershell
npm.cmd run dev
```

Se houver conflito de porta, encerre a versão anterior com Ctrl+C. Não é necessário instalar dependências. Para verificar o código, execute `npm.cmd test` (18 testes).

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

O servidor cria a pasta data ao lado de server.mjs. Ela contém contas, calendários, versões e PDFs históricos. Os PDFs estão codificados no arquivo database.json nesta versão local. Pare o servidor antes de copiar a pasta data para backup. Guarde-a em local restrito; não a envie ao GitHub, não a inclua em pacotes de código e não a substitua ao atualizar o aplicativo.

O código do primeiro ADMIN aparece apenas enquanto não há usuário cadastrado. Depois, use o login normal. As sessões expiram após oito horas e também terminam ao reiniciar o servidor. Ainda não há recuperação de senha nem redefinição pelo painel; guarde sua senha local.

## O que esta versão não faz ainda

- Não oferece acesso remoto: todos os usuários precisam acessar a mesma instalação. Copiar o ZIP para computadores diferentes não sincroniza suas bases.
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
