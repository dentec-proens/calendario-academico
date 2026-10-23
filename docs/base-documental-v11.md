# Base documental institucional

ADMIN pode enviar e publicar documentos por ano, com tipo, identificação e metadados. CAMPUS consulta apenas os documentos publicados. A substituição conserva o arquivo e o histórico anterior; publicar altera a revisão institucional e pode exigir nova conferência dos calendários.

O upload usa Convex Storage: ticket autenticado vinculado ao proprietário, limite de tamanho, assinatura PDF e hash conferidos no backend. O arquivo validado só pode ser consumido uma vez. Consultas reativas atualizam a lista; downloads exigem autorização e usam tickets temporários.

Os documentos são fontes para consulta. O envio não extrai automaticamente novas regras, não muda as cores e não altera o motor de cálculo. As datas institucionais devem ser registradas na base compartilhada e regras novas precisam ser implementadas e verificadas. O calendário histórico do campus continua sendo uma referência separada.

Os testes de publicação usam somente fixtures locais ou deployment descartável. Não publique documentos fictícios na base importada: essa operação altera a revisão compartilhada.
