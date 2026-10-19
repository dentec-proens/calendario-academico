# Recuperação do tráfego de dados — 19/10/2026

A indisponibilidade foi causada pela restrição de quota de egress da organização
Supabase. O processo de inicialização também dependia da disponibilidade do
Storage, fazendo uma falha de PDFs impedir a abertura do sistema inteiro.

## Correção compatível com os dados existentes

- Sessões e usuários são consultados por identificador, com parâmetros SQL.
- A listagem recebe somente metadados dos calendários.
- A abertura e o salvamento selecionam o calendário solicitado. A autorização
  do campus continua sendo verificada no servidor.
- As versões anteriores permanecem completas em `dentec_private.app_state`;
  somente seus metadados são retornados nas consultas comuns.
- Escritas usam diferenças JSONB parametrizadas dentro da transação com
  `SELECT ... FOR UPDATE`. Snapshots anteriores não são retransmitidos nem
  substituídos por metadados. Tentativas de substituir o histórico são rejeitadas.
- Leituras idênticas são compartilhadas somente dentro de uma requisição,
  evitando cache de autenticação ou dados entre usuários.
- O serviço privado de PDFs é inicializado na primeira operação com arquivos.
  Quota indisponível devolve 503 nessa operação, preservando login e edição
  quando a conexão PostgreSQL estiver disponível. Buckets públicos continuam
  bloqueados; erros de quota não provocam criação de buckets.

Não há exclusão, migração destrutiva, troca de contas ou alteração da estrutura
canônica nesta recuperação. Isso permite a implantação gradual e a reversão do
código sem abandonar os dados. A normalização em tabelas independentes e a
remoção do bloqueio global de escrita permanecem melhorias futuras; o documento
JSONB ainda impõe custo interno ao banco, mesmo com o tráfego reduzido.

## Preservação e verificação

Antes da publicação foi criada no próprio banco uma cópia privada em
`dentec_private.app_state_backup_20261019_perf`, com RLS ativo e sem acesso de
PUBLIC, anon ou authenticated. A cópia confirmou 38 calendários, 324 versões
anteriores e 8.411.376 bytes de JSON textual. Ela contém dados de conta e deve
permanecer restrita: não exportar para repositórios nem expor por API.

Os testes usam PostgreSQL local via PGlite com dados fictícios, consultas SQL
reais e requisições HTTP. Verificam preservação de todos os snapshots, campos
desconhecidos e PDFs, escrita no calendário correto, rollback, concorrência,
isolamento entre campi, conflito de versão, reabertura e revogação de sessão.
O teste PostgreSQL externo requer uma base descartável explícita e nunca deve
ser apontado para produção.

No cenário sintético com 80 snapshots volumosos, a transação transferiu 5.458
bytes de valores/resultados JSON, contra 1.609.390 bytes de uma leitura completa
anterior. Não é uma medição do consumo faturado em produção nem inclui overhead
de protocolo/TLS. O efeito real deve ser acompanhado no painel do Supabase.

## Operação após a publicação

Conferir o commit em produção, a abertura da página e `/api/status`; em sessão
autenticada, abrir um calendário existente e conferir suas datas/eventos.
Operações com PDF podem continuar indisponíveis enquanto o Supabase mantiver
a restrição de quota. A alteração do código não libera a quota acumulada.
Não restaurar o backup sobre uma base com alterações posteriores sem uma
análise de reconciliação. O rollback de aplicação não exige restauração de dados.
