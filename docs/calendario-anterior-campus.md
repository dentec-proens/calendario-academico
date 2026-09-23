# Calendário anterior do campus — 21/09/2026

O painel de calendários e o topo do editor oferecem **Enviar calendário anterior** para ADMIN e CAMPUS. O arquivo fica vinculado ao campus e ao calendário. PDFs já enviados podem ser analisados pelo botão **Identificar feriados e eventos**.

Após guardar o PDF, o sistema usa PDF.js no servidor para extrair texto, identificar possíveis feriados e atividades e apresentar sugestões com página e trecho de origem. Indícios municipais aparecem primeiro. Essa identificação usa palavras-chave; não é validação normativa nem leitura completa garantida de tabelas. O texto identificado também fica disponível para consulta.

**Revisar e incluir** preenche a descrição e a categoria no formulário de evento. Datas atuais, fonte vigente, efeito na contagem e formas de oferta/níveis precisam ser conferidos pelo diretor. Nada é incorporado automaticamente. O vínculo com o documento histórico e a página é preservado no evento salvo e validado no servidor. A base PROENS permanece superior ao documento histórico.

Limites: PDF até 8 MB e 30 páginas, com texto selecionável e sem senha; sem OCR de imagens. Há limite de 150 sugestões, com aviso quando excedido. Em falha de leitura, o PDF permanece guardado para consulta. A análise fica registrada no histórico de ações e seu acesso é restrito ao campus proprietário ou ADMIN.

Validação: testes HTTP de upload/análise por CAMPUS, isolamento entre campi, análise sem inclusão automática, persistência da origem, rejeição de referência indevida e leitura de PDF inválido/sem texto. Teste real em Chrome com conta fictícia, PDF de Foz, revisão de feriado e salvamento; nenhum dado de produção foi alterado.
