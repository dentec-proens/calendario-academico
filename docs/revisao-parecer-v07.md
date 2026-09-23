# Apoio à revisão humana — versão 0.7

Fonte: Parecer SEI 3959640, processo 23411.022139/2025-34, páginas 1–2. Trata do calendário de 2026 e da Resolução Consup/IFPR 259/2025. A página 3 contém conclusão favorável de um modelo com campus/versão em aberto: esse texto não é reproduzido como decisão automática.

A aba ADMIN “Revisão do parecer” contém os cinco critérios iniciais e os 25 incisos do art. 7º citados no documento. Para cada item, exibe documento, página, artigo/inciso, indicação automática, eventos possivelmente relacionados, situação humana e observações.

A indicação automática faz contagem determinística quando os dados permitem; lista períodos; aponta conflitos de inclusão/exclusão; identifica candidatos por nome/categoria. A busca textual não extrai conteúdo de PDFs, não prova presença/ausência documental, não comprova horas e não verifica integralmente sequência, frequência ou adequação dos eventos. O revisor confere cada candidato e informa evidência ou justificativa para qualquer conclusão diferente de Pendente.

O roteiro de 2026 não se torna norma de 2027. Um alerta destacado e avisos em cada critério exigem confronto com a norma vigente. A janela de datas de 2026 só é comparada automaticamente em calendários de 2026. A normalização formal do roteiro para cada ano é trabalho posterior; a resolução do ano prevalece.

GET/PUT /api/reviews/:calendarId exige ADMIN no servidor. O registro guarda autoria, data, versão do calendário, revisão da base institucional, revisão da análise e histórico dos registros anteriores. Gravações concorrentes ou contra calendário/base alterados são rejeitadas. Revisões antigas ficam sinalizadas como desatualizadas e exigem confirmação de reavaliação antes do novo salvamento. Nenhum registro altera a situação oficial de aprovação.

Compatibilidade: novas análises ficam em reviews na base JSON local existente; registros anteriores permanecem inalterados até uma revisão ser salva. Atualização de código preserva data.

Verificação: 19 testes passaram, incluindo 30 critérios, alerta para outro ano, identificação como indício, restrição a ADMIN, evidências obrigatórias, autoria, persistência, concorrência e reavaliação após alteração da base. Revisão do parecer ainda não tem exportação ou assinatura SEI.
