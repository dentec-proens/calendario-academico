# Análise inicial e exportação do parecer — v08

O sistema preenche automaticamente as 30 linhas do roteiro SEI 3959640 e propõe o texto inicial da seção 2. As situações propostas continuam identificadas como automáticas até o parecerista confirmar a leitura ou editar. O botão Editar habilita situação e justificativa por item; Editar texto do parecer habilita a conclusão. O registro conserva autoria, versão e histórico já implementados.

O cálculo pode demonstrar insuficiência de dias ou comparar a janela de datas. Atingir 200 dias não comprova a carga horária do PPC. Documentos não estruturados, horas e sequência de atos continuam pendentes de conferência. Correspondência textual identifica candidatos, não conformidade. Para outro ano, a norma do modelo de 2026 não é aplicada como norma vigente: as propostas permanecem pendentes de confronto com o documento correto.

A exportação usa identificação do processo, assunto, campus, oferta/cursos, norma informada pelo revisor, tabela de análise técnico-pedagógica e seção 2 — Parecer. Inclui versão, autoria e distinção entre avaliação humana e proposta automática. Não copia assinatura, código de autenticidade ou conclusão favorável do documento de referência.

Formatos: HTML independente com tabela (apropriado para abrir, selecionar e colar no editor do SEI), texto UTF-8 e cópia para a área de transferência em HTML/texto. A visualização permite copiar manualmente se o navegador bloquear a área de transferência. Não há conexão, publicação ou assinatura no SEI; a formatação deve ser conferida após colagem.

POST /api/reviews/:calendarId/export exige ADMIN, revisão salva e atual e bloqueia alterações de calendário/base posteriores. A geração é feita a partir da revisão persistida, não de texto arbitrário enviado à exportação. HTML escapa conteúdo do usuário. Itens automáticos são recalculados pelo servidor ao salvar; alterações humanas ficam identificadas.

Validação: 20 testes passaram, cobrindo análise inicial, pendências documentais, exportação, escape de HTML, acesso restrito e bloqueio de exportação desatualizada. Fluxo de interface conferido com dados sintéticos: geração dos 30 itens, edição de observação, salvamento com autoria, visualização da tabela e acionamento do download HTML. A colagem no SEI não foi testada. Os dados reais não foram acessados fora das rotas do aplicativo.
