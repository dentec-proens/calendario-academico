# Base documental da PROENS — versão 0.11

## Uso pela administração
1. Entre como ADMIN e abra **Base institucional**.
2. Em **Documentos da PROENS por ano**, informe ano, tipo, título e identificação da fonte (número SEI, resolução e fundamento da vigência).
3. Envie o PDF de até 8 MB. Ele será registrado como rascunho, visível somente ao ADMIN.
4. Baixe e confira o arquivo e o ano. Marque a conferência e clique em **Definir como vigente**.
5. A versão anteriormente vigente do mesmo tipo e ano será arquivada, sem excluir seu arquivo. Uma versão arquivada pode ser reativada mediante nova conferência.
6. Para consultar anos anteriores, use o filtro. Campi podem baixar os documentos publicados, incluindo versões arquivadas, mas não podem alterá-los.

Tipos: resolução/norma, calendário de referência e modelo de parecer/checklist. A identificação da fonte deve registrar a aprovação informada mesmo quando o nome original do PDF ainda contenha “minuta”. O sistema não presume aprovação pelo nome do arquivo.

## Efeitos e limites
A alteração da vigência aumenta a revisão da base compartilhada. Calendários precisam incorporar a revisão antes de baixar PDF; análises salvas ficam desatualizadas e exigem reconferência antes da exportação. A revisão compartilhada é global: a mudança pode exigir reconferência inclusive em outros anos.

Cada versão salva do calendário e do parecer guarda metadados, identificadores e hashes dos documentos vigentes do seu ano. Versões antigas preservam a referência anterior. A migração não inventa vínculos documentais para registros criados antes desta funcionalidade.

Enviar PDF disponibiliza o documento para consulta; NÃO extrai automaticamente regras, datas ou cores. Eventos devem ser conferidos e cadastrados na mesma aba. A análise automática continua baseada no checklist do parecer SEI 3959640 de 2026, com aviso para outros anos. Os mínimos implementados no cálculo e a diagramação não são reprogramados pelo arquivo enviado. Novas exigências de cálculo/checklist ou um novo padrão gráfico precisam de implementação e validação. O documento vigente continua sendo a fonte para a revisão humana; nunca há declaração automática de aprovação oficial.

Nenhum documento é registrado automaticamente nesta atualização: a equipe seleciona o arquivo e informa explicitamente o ano de aplicação.

## Preservação e continuidade
Metadados e versões ficam no PostgreSQL. Em desenvolvimento os PDFs podem permanecer no banco; com Storage configurado, novos arquivos ficam no bucket privado `dentec-private`. PDFs importados de instalações anteriores continuam disponíveis. Reiniciar o aplicativo não apaga os registros.

Para cópia completa, mantenha backup do PostgreSQL e dos objetos privados do Storage, além da versão correspondente do aplicativo. Faça cópias periódicas e teste a restauração. O banco contém contas e dados institucionais e deve permanecer com pessoas autorizadas. Copiar a pasta `data` preserva apenas a base JSON antiga, que o servidor não utiliza mais. Consulte [migração e backup](postgresql.md); não misture bancos de duas instalações.

A disponibilidade pela internet e os backups automáticos dependem da configuração da implantação. Uma conexão PostgreSQL válida não é, por si só, garantia de disponibilidade permanente ou de backup.

## Desenvolvimento
GET /api/documents: metadados, sem conteúdo dos arquivos; rascunhos exclusivos do ADMIN.
POST /api/documents: upload ADMIN, versão crescente por ano/tipo, conteúdo e SHA-256 imutáveis.
GET /api/documents/:id: download autenticado; campi somente documentos já publicados.
POST /api/documents/:id/status: ADMIN, revisão otimista e confirmação de aplicabilidade para vigência; arquivamento preserva arquivo.

Persistência utiliza transações PostgreSQL com entidades separadas, preservando a revisão otimista e os snapshots. JSON é formato de importação/exportação; nenhuma gravação operacional usa `data/database.json`. Migrações são comandos explícitos, separados da inicialização do servidor.

Verificação: testes de autorização, publicação, conflitos de revisão, separação por ano, preservação dos PDFs, referências históricas e reabertura do armazenamento.
