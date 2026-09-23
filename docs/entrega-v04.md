# Versão 0.4

- Seleção explícita de sábados por mês, com fonte e confirmação. Datas fora de períodos ficam indisponíveis; inclusões existentes não são duplicadas. Conflitos com exclusões permanecem destacados e excluídos da contagem.
- PDF direto: POST /api/calendars/:id/pdf, autenticado e autorizado pelo campus. Exige versão e revisão institucional atuais e salvas. Usa HTML/CSS do modelo já incorporado; Chrome (preferencial) ou Edge instalado no servidor, perfil temporário isolado, sem dependências npm adicionais. DENTEC_PDF_BROWSER permite indicar outro executável Chromium. Nenhum conteúdo histórico enviado é executado.
- ADMIN: lista de todos os campi com quantidade de calendários/contas e filtro de calendários por campus. CAMPUS: apenas unidade vinculada, sem seletor de outras unidades. A restrição é aplicada também pelo servidor, inclusive a downloads e gravações.
- Correção: baixar JSON não marca mais as alterações como salvas no servidor.
- 17 testes passaram: contagem, seleção mensal, duplicidade, conflitos, persistência, acesso entre campi, download autenticado e bloqueio de PDF desatualizado. PDF de exemplo gerado no Chrome e suas três páginas inspecionadas visualmente. Não houve teste de clique no navegador nesta rodada.

O PDF preserva a estrutura mensal, tabelas, legenda e totais da adaptação PROENS existente. Ainda não é uma reprodução exata da logomarca/paginação do arquivo original. Nenhuma proposta é declarada oficialmente aprovada.

Atualização de v03: preservar integralmente data; substituir somente código após backup e reiniciar o servidor. A estrutura de dados permanece compatível. Não é preciso recriar contas.
