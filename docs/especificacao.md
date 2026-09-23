# Assistente de Calendários Acadêmicos DENTEC PROENS

Especificação funcional e técnica para desenvolvimento • versão 0.1 • 14 de setembro de 2026

## 1 Objetivo e decisões de projeto

Construir uma aplicação web institucional do IFPR que permita elaborar, revisar, conferir e preparar o envio de calendários acadêmicos e administrativos. O sistema deve gerar documentos utilizáveis pelos campi, com contagem reproduzível, fundamentação das regras e identificação explícita de pendências. O resultado é uma proposta ou conferência preliminar: a aplicação não concede aprovação oficial.

Esta especificação consolida o histórico da conversa “Criar agente calendários letivos”, as instruções atuais da solicitante e a leitura do arquivo SEI 4354987, referente ao calendário de 2027. Não reproduz os documentos Word 01 e 02 mencionados naquela conversa, cujos conteúdos integrais não estavam disponíveis. As decisões técnicas abaixo são propostas de implementação; os critérios normativos expressamente citados provêm da resolução lida.

A solicitante confirmou em 14/09/2026 que a resolução foi aprovada e está autorizada, embora o arquivo mantenha “Minuta” no nome. Registrar essa confirmação como evidência de situação documental, sem transformar o nome do arquivo em critério de validade. Número final, publicação e eventual versão consolidada permanecem campos a completar, sem invalidar a confirmação recebida.

O MVP atende calendários dos cursos técnicos de nível médio e de graduação. Qualificação profissional, pós-graduação e EaD têm calendários próprios, conforme art. 1º, § 2º; não recebem automaticamente o mesmo pacote de regras. A lista oficial de campi e suas ofertas será cadastrada pela administração, sem listas fictícias apresentadas como reais.

## 2 Arquitetura funcional

Adotar inicialmente um monólito modular: interface web, API institucional, motor de calendário, motor de regras, gestão documental e exportador com fronteiras explícitas. Processamento demorado de arquivos e IA ocorre em trabalhos assíncronos. Isso permite substituir serviços sem alterar o domínio do calendário.

Fluxo de dados: navegador → API autenticada → banco e armazenamento privado. A API envia extrações para uma fila; o processador faz leitura/OCR e produz sugestões com evidências. O usuário confirma sugestões. O motor determinístico calcula e valida a versão confirmada. O exportador lê uma fotografia imutável dessa versão e de sua validação.

Proposta tecnológica: interface em TypeScript com framework web a selecionar na implementação, API Node.js, PostgreSQL, armazenamento de objetos privado e identidade institucional via OIDC ou SAML conforme disponibilidade do IFPR. O scaffold usa JavaScript modular para executar o domínio sem instalar bibliotecas. A escolha de hospedagem permanece aberta; não existe dependência funcional de GitHub, Vercel ou conta pessoal de ChatGPT.

O banco deve ter isolamento por campus na API e defesa adicional por políticas de acesso às linhas. A conta de aplicação não deve ser proprietária das tabelas nem ter bypass dessas políticas. A documentação oficial do PostgreSQL alerta que proprietários normalmente não se submetem às políticas: https://www.postgresql.org/docs/current/ddl-rowsecurity.html.

Módulos: identidade e vínculos; cadastro de campus/município/ofertas; documentos e extrações; regras por ano; calendários e versões; eventos/feriados; cálculo; checklist; exceções; relatórios e auditoria. O motor de cálculo não chama IA, rede ou relógio do sistema; recebe os dados necessários como entrada e produz sempre o mesmo resultado.

## 3 Perfis e permissões

ADMIN DENTEC/PROENS administra usuários e vínculos, campi, documentos institucionais, regras e modelos, consulta todos os calendários e registra análises. CAMPUS cria e altera apenas os calendários das unidades às quais está formalmente vinculado, fornece documentos locais e gera propostas e relatórios.

Ter e-mail @ifpr.edu.br não concede acesso por si só. Após autenticar, o backend verifica usuário ativo, papel e vínculos cadastrados. O primeiro administrador deve ser provisionado por procedimento controlado da instituição. Não permitir que usuários se promovam a ADMIN ou escolham livremente seu campus no login.

Todas as operações com identificadores, inclusive downloads, trabalhos assíncronos, relatórios e buscas documentais, devem validar o escopo do usuário. Um campo campusId enviado pelo navegador não é prova de autorização. Revogar vínculo deve impedir novas operações e downloads; links de arquivo têm prazo curto e escopo restrito.

## 4 Jornada e fluxo de telas

T01 Entrada institucional: login, conta sem vínculo, conta desativada e falha de autenticação com orientação clara. Não criar calendário antes de resolver o acesso.

T02 Painel: CAMPUS vê seus calendários por ano, oferta e estado; ADMIN vê visão institucional e filtros de unidade. Ações: novo calendário, continuar, revisar versão existente e consultar pendências. Indicadores devem distinguir ausência de dados de zero pendências.

T03 Identificação: selecionar campus autorizado, ano, oferta, cursos abrangidos, regime e organização dos períodos. Ofertas com critérios distintos geram calendários separados ou escopos de cálculo separados. Ao mudar ano ou oferta, reavaliar as fontes e invalidar a validação anterior.

T04 Base documental: mostrar resolução, referência e parecer selecionados, ano, versão, situação e origem. Documentos faltantes aparecem como pendência. Permitir salvar rascunho; impedir selo de conformidade completa sem pacote documental suficiente. O nome “Minuta” não altera sozinho a situação registrada.

T05 Histórico opcional: enviar calendário anterior correspondente à oferta. Mostrar progresso e erros de leitura. A extração gera uma matriz com item histórico, localização no arquivo, categoria, sugestão de tratamento e confirmação local. Não transferir automaticamente datas para o novo ano. Sem arquivo, seguir para preenchimento local.

T06 Município e campus: apresentar candidatos a feriados com lei/decreto ou página oficial, ano de incidência, abrangência, natureza e data de consulta. O servidor confirma a aplicabilidade. Diferenciar feriado, ponto facultativo, recesso e evento comemorativo. Uma confirmação de “nenhum feriado adicional” deve ser explícita e ter justificativa/evidência; lista vazia não significa conferência concluída.

T07 Construção: configurar períodos, férias, horários/semana letiva, eventos e decisões locais. O assistente usa itens já conhecidos e pergunta apenas o que falta. Propostas automáticas de datas locais são apresentadas como alternativas calculadas dentro das restrições e só entram após aceite. Eventos sem data definida permanecem pendentes.

T08 Editor: alternar grade anual/mensal e lista acessível. Selecionar evento abre datas, ofertas, classificação, efeito sobre a contagem, fonte e histórico. Mostrar totais por curso/oferta, período e dia da semana. Toda edição recalcula o escopo afetado e torna a conferência anterior desatualizada. Avisos não podem depender apenas de cor.

T09 Validação: listar cada requisito com resultado, severidade, observado, esperado, artigo/item, eventos afetados e ação de correção. Filtros: não atendido, não verificável, requer análise humana, atendido e não aplicável com justificativa. Corrigir leva ao campo correspondente; rejeitar uma sugestão da IA não apaga o achado.

T10 Preparar envio: conferir atas CGPC/Codic, antecedência, modelo, feriados, decisões e validação atualizada. Gerar calendário e relatório da mesma versão. O MVP não protocola automaticamente no SEI. Rascunhos podem ser exportados com pendências claramente marcadas; pacote “pronto para encaminhamento” exige os critérios definidos na seção 8.

T11 Administração: cadastro e ativação de pacote anual, cobertura do checklist, modelos de saída, vínculos e trilha de alterações. Antes de ativar nova versão, mostrar impacto nos calendários existentes. Não atualizar silenciosamente versões já exportadas.

Os quatro modos reutilizam essas telas: construir parte da identificação; revisar importa uma proposta atual e confirma sua extração; conferir executa análise sem alterar o calendário; preparar envio exige versão consolidada e documentos administrativos. Um calendário importado para revisão não deve ser confundido com o histórico do ano anterior.

## 5 Modelo de dados

Identificadores são UUID; datas civis usam DATE no banco e YYYY-MM-DD na API; instantes de auditoria usam UTC. Não armazenar datas letivas como timestamps sujeitos à conversão de fuso. A apresentação de instantes considera America/Sao_Paulo. Todo registro mutável tem versão de concorrência.

| Entidade | Campos principais e relações |
|---|---|
| Campus | id, nome oficial, município, UF, código municipal, ativo |
| Usuário e vínculo | id, subject do provedor, e-mail, papel, ativo; vínculo usuário–campus |
| Oferta e curso | id, campusId, nível, forma, modalidade, regime; cursos vinculados e referência PPC |
| Documento | id, categoria, campusId opcional para institucional, título, nome original, hash SHA-256, armazenamento, ano/escopo, versão, situação, emitente |
| Evidência documental | documentId, página/artigo/inciso, trecho, localizador, origem, conferente, data; confirmação da aprovação separada do nome do arquivo |
| Pacote de regras | id, ano, ofertas aplicáveis, versão, estado, documentos fixados, revisão humana e data de ativação |
| Regra | id estável, versão, pacoteId, predicado de escopo, parâmetros, severidade, evidência, algoritmo ou verificação humana |
| Calendário | id, campusId, ano, ofertaId, cursos abrangidos, modo, estado e versão corrente |
| Versão de calendário | id, calendarId, número, pai, pacoteId, autor, instante e hash dos dados; imutável após consolidação |
| Período | id, versionId, nome, tipo, início/fim inclusivos e organização; etapas podem ser filhas de semestre |
| Evento | id, versionId, início/fim, natureza, classificação, ofertas/cursos, status de confirmação, efeito acadêmico/administrativo, horas e evidências |
| Feriado local | id, município, ano/data, natureza, documento oficial, aplicabilidade e confirmação; relacionado ao evento |
| Item histórico | id, documento anterior, trecho/localização, categoria sugerida e decisão de manter/atualizar/descartar; não conta como evento |
| Validação | id, versionId, pacoteId, versão do motor, hash de entrada, data, totais e conclusão preliminar |
| Achado | id, validationId, ruleId, escopo, resultado, severidade, observado/esperado, evidências e resolução |
| Exceção | id, achado, justificativa, documento de deliberação, responsável, escopo, validade e situação; não sobrescreve a regra |
| Exportação | id, versionId, validationId, templateVersion, hashes dos arquivos e autor |
| Auditoria | ator, ação, entidade, antes/depois ou hashes, instante e correlação; sem segredo ou texto sensível desnecessário |

Restrições: fim >= início; unicidade do número de versão por calendário; evento pertence à mesma versão/campus autorizado; regra sempre aponta para evidência; vínculo de oferta e calendário deve ser do mesmo campus; referências imutáveis impedem alteração retroativa de relatório. Totais são derivados, nunca valores editáveis no formulário.

Períodos do mesmo nível não podem sobrepor. Etapas contidas em semestres são permitidas e não são somadas novamente ao total anual. Distinguir a contagem de datas únicas por oferta da contagem de horas por atividade: duas atividades no mesmo dia não criam dois dias letivos.

## 6 Fontes e gestão documental

Hierarquia acordada: resolução/norma aplicável ao ano → calendário de referência do mesmo ano → parecer/checklist PROENS → informações oficiais locais → calendário anterior apenas histórico. Aplicabilidade é verificada antes da hierarquia: um documento de outro ano ou oferta não prevalece só por sua categoria. Conflito não resolvido entre fontes do mesmo nível exige análise institucional, não escolha arbitrária da IA.

Inventário inicial: resolução SEI 4354987, processo 23411.011715/2026-07, conteúdo lido e aprovação confirmada pela solicitante; calendário de referência 2027 mencionado no histórico, conteúdo integral pendente; parecer SEI 3959640 mencionado no histórico, conteúdo integral pendente; históricos dos campi opcionais; atos municipais e particularidades locais a obter por município e ano; modelo gráfico oficial a recuperar. Não afirmar conformidade com checklist que não foi lido.

Ingestão: upload privado → validação de extensão, assinatura de arquivo e tamanho → análise de segurança → hash → extração por página/célula → sugestões de regras/eventos → conferência humana → versão publicada na base. PDF escaneado exige OCR e revisão dos campos críticos. Arquivo ilegível não produz datas presumidas. Reenvio idêntico pode reutilizar extração pelo hash sem perder autoria e escopo.

Registrar número/publicação quando disponíveis, situação da norma e evidência da confirmação. Conservar o arquivo original como referência imutável. O ADMIN versiona correções ou consolidações sem apagar a versão usada anteriormente. No projeto local, arquivos sincronizados em sources continuam somente leitura.

## 7 Motor de calendário e critérios da resolução

O cálculo trabalha com datas civis e intervalos inclusivos. Para cada oferta/curso, expandir períodos em datas, aplicar semana letiva confirmada, incluir reposições/sábados explicitamente autorizados e excluir feriados, recessos e demais impedimentos aplicáveis. A data é contada uma única vez. Dias sem confirmação pedagógica são candidatos, não prova de efetiva atividade letiva.

No scaffold, a semana letiva já representa uma configuração confirmada; inclusões extraordinárias exigem evidência e confirmação. Exclusões são explícitas, também confirmadas e documentadas. Não existem feriados embutidos nem preenchimento automático com sábados. A validação de entrada rejeita dados inconsistentes; o relatório deixa explícito que a conferência institucional continua incompleta.

Para cada dia contado, retornar motivo e evidência; para cada exclusão, devolver os registros que a causaram. Em inclusão e exclusão simultâneas, excluir preventivamente da contagem e emitir conflito. Essa é uma regra de segurança do cálculo, não deliberação institucional sobre exceção. Uma exceção só altera a entrada após registro da decisão competente.

Regras extraídas do documento SEI 4354987, a serem implementadas e conferidas com o pacote completo:

| Código | Verificação e fundamento |
|---|---|
| NOR 01 | Datas do art. 2º obrigatórias, com exceções do art. 3º; distinguir feriados, recessos, comemorações e prazos, sem excluir todas as datas indiscriminadamente |
| NOR 02 | Dia do Professor ajustável pelo campus, art. 3º § 1º; demais alterações excepcionais exigem justificativa e deliberação PROENS, § 3º |
| NOR 03 | Prazo da referência coincidente com feriado municipal ou recesso decorrente vai ao primeiro dia letivo subsequente, art. 3º § 2º; não deslocar todo evento e não usar simplesmente “dia útil” |
| NOR 04 | Mínimo de 200 dias anuais por curso, art. 4º; mínimo de 100 em cada semestre para organização semestral, § 1º |
| NOR 05 | Atividade letiva requer enquadramento pedagógico e participação efetiva de professores e estudantes, art. 5º; formação de servidores não é automaticamente letiva |
| NOR 06 | Recessos acadêmicos e acadêmico-administrativos têm efeitos distintos, arts. 6º e 7º |
| NOR 07 | Período de referência entre 01/02/2027 e 17/12/2027; início letivo até 15/02/2027, art. 8º |
| NOR 08 | Cursos/vagas até 31/05/2027, art. 9º; editais de ingresso até 15/06/2027, com ajuste PROENS previsto no art. 10 |
| NOR 09 | Presença de todos os itens aplicáveis do art. 11, incisos I a XXVI; não tratar o resumo desta tabela como checklist integral |
| NOR 10 | Férias docentes de 45 dias, art. 11 IV; contar datas únicas, distinguir férias escolares/docentes e não inferir férias individuais de lacunas |
| NOR 11 | Matrículas, ajustes, trancamento e cancelamento dos incisos V e VII aplicáveis a subsequentes/graduação; não exigir indistintamente de integrado |
| NOR 12 | Aproveitamento/certificação/equivalência de estágio pelo menos uma vez para anual e duas para semestral, art. 11 VI; editais de ingresso antes do período e na periodicidade do inciso VIII |
| NOR 13 | Resultados, diários, planos, PIT/RIT, conselhos e revisão na sequência dos incisos IX a XV; conselhos ordinários após divulgação de resultados parciais |
| NOR 14 | Reuniões com familiares/comunidade, eventos, egressos e estágios, incisos XVI a XIX; fase local OBR até 31/08 e Mostra até 30/09, XX e XXI |
| NOR 15 | Formação pedagógica >= 40 horas anuais e planejamento/replanejamento >= 20 horas, art. 11 XXII e XXIII; exigir horas explícitas, não converter dias em horas presumidas |
| NOR 16 | Semanas dos incisos XXIV a XXVI obrigatórias nos técnicos, facultativas na graduação; operacionalizar “segunda semana”/“primeira semana” com convenção institucional registrada |
| NOR 17 | JIFPR, SE²PIN e outros eventos institucionais incorporados quando definidos, art. 12; data ainda desconhecida permanece pendente |
| NOR 18 | Sábados letivos vinculados às finalidades do art. 13, sem inserção automática para fechar meta |
| NOR 19 | Modelo PROENS e apreciação CGPC/Codic, art. 14; envio SEI ao menos 60 dias antes do início, com extratos de atas, art. 15 |
| NOR 20 | Alteração posterior exige novo encaminhamento e documentos; antecedência de 30 dias salvo hipótese do § 2º, art. 16; validar contra data de alteração explicitamente informada |
| NOR 21 | Reposição e carga de trabalho têm análise própria, art. 17; feriados oficiais da sede sem expediente, art. 19; casos omissos vão à PROENS, art. 20 |

A aprovação da resolução não equivale à aprovação de um calendário de campus. O sistema deve conservar essa distinção em telas e relatórios. A publicação do calendário depende do trâmite institucional descrito no art. 15.

O prazo de 60 dias pode cair no ano civil anterior. O motor deve aceitar datas administrativas fora de 2027 e calculá-las por subtração de dias civis; qualquer interpretação específica diferente depende de regra documentada. Para prazo deslocável, procurar na sequência de dias letivos do escopo correspondente; se não existir data confirmada posterior, retornar não verificável.

Horas curriculares exigem dados de curso/componente/plano que não se deduzem do calendário. Na ausência desses dados, apresentar “carga horária não verificada”, ainda que a quantidade de dias atenda à meta. Não somar indiscriminadamente horas simultâneas da mesma equipe para comprovar formação.

## 8 Validação e estados

Classificações operacionais propostas para ratificação pela DENTEC: INSTITUCIONAL FIXO, INSTITUCIONAL DE REFERÊNCIA, LOCAL CONFIRMADO, HISTÓRICO e PENDENTE. Classificação e natureza são campos distintos: um evento fixo pode ser comemorativo e não impedir atividade letiva. HISTÓRICO não entra no calendário nem na contagem sem nova decisão com proveniência.

Resultados de regra: ATENDIDO, NÃO ATENDIDO, NÃO VERIFICÁVEL, ANÁLISE HUMANA e NÃO APLICÁVEL. Severidades: bloqueio, alerta e informação. Ausência de evidência exigida produz NÃO VERIFICÁVEL; nunca ATENDIDO. Não aplicável exige critério de escopo e justificativa. Achado conserva identidade da regra e da execução, mesmo depois de resolvido em versão futura.

Estados do calendário: RASCUNHO → EM CONFERÊNCIA → COM PENDÊNCIAS ou APTO PARA ENCAMINHAMENTO. Exportações são registros separados. Alteração de dados/pacote devolve o calendário à conferência e invalida aptidão anterior. “Apto” significa apenas que os critérios preliminares configurados foram satisfeitos, não aprovação institucional.

Portão de encaminhamento: pacote anual completo e conferido; validação correspondente ao hash atual; nenhum bloqueio nem verificação obrigatória sem evidência; feriados locais conferidos; verificações humanas concluídas; atas e informações de envio presentes; modelo oficial ativo. Alertas podem exigir ciência justificada conforme a política institucional. Uma justificativa digitada não remove descumprimento obrigatório que exige deliberação da PROENS.

Exceções têm fluxo próprio: solicitação → análise → deliberação externa registrada → aplicação no escopo autorizado → nova validação. O ADMIN registra uma decisão documental; não inventa autorização e não altera a norma para acomodar um caso. A IA não aceita exceções.

## 9 Contratos da API e processamento

O arquivo api.yaml fornece o primeiro contrato de criação, consulta e validação. Os endpoints ainda não estão implementados. Todas as rotas exigem identidade e autorização por campus. Validar tipos, limites, identificadores, datas e referências no backend, independentemente do formulário.

Criação exige campus/oferta autorizados, ano, modo e pacote compatível. Edição exige versão esperada para evitar sobrescrita: concorrência gera HTTP 409 e comparação das alterações. Validação recebe identificador imutável da versão; o servidor resolve os dados, nunca confia em totais enviados pelo cliente.

Uploads futuros retornam trabalho com id e estados aguardando/processando/concluído/falhou. Repetições usam chave de idempotência por usuário e operação. Falha de IA/OCR preserva o arquivo e os campos já confirmados; o servidor pode seguir manualmente. Downloads e resultados de trabalhos também verificam vínculo de campus.

Exportar requer versionId e validationId compatíveis, tipo rascunho ou encaminhamento e templateVersion. Retornar erro de domínio identificável para base incompleta, evidência ausente, validação desatualizada ou conflito. Nunca responder “sucesso” com arquivo parcial sem indicação.

## 10 Regras da IA

A IA auxilia extração, classificação, interpretação e explicação. Não é responsável por aritmética final, autorização, persistência direta de alterações, autenticação ou aprovação. O sistema deve funcionar manualmente se o serviço estiver indisponível.

Contexto permitido: documentos do ano/oferta corretos, institucionais ou pertencentes ao campus autorizado, com identificador e localizador. A recuperação filtra permissões antes de enviar trechos ao modelo. Histórico é identificado explicitamente como histórico e não integra busca normativa.

Instrução central: não inventar datas, artigos, feriados, horas, períodos ou decisões. Distinguir dado documentado, confirmação do campus e proposta ainda não aceita. Toda afirmação normativa deve citar documentId e página/artigo/item existente. Quando faltar base, devolver pendência e pergunta específica; não completar com memória geral.

Saída estruturada da IA: sugestão com tipo, valor proposto, escopo, evidências, campos ausentes, necessidade de confirmação e explicação. A API valida o formato e se as referências existem; sugestões inválidas são rejeitadas. Confiança declarada pelo modelo não é prova de correção. Números de dias apresentados ao usuário vêm exclusivamente do motor.

Documentos e páginas web são dados não confiáveis: instruções embutidas para ignorar regras, acessar outro campus, revelar segredos ou executar código devem ser desconsideradas. Sem execução de macros ou comandos extraídos. Credenciais da IA permanecem no servidor; registrar versão do modelo e instruções, minimizando textos pessoais nos logs.

Testes de IA: texto ilegível; artigo inexistente; arquivo de outro ano; ponto facultativo descrito como feriado; tentativa de copiar data histórica; pedido de aprovação oficial; instruções maliciosas dentro do PDF; fonte de outro campus; conflito sem solução. Critério proposto: nenhuma data sem evidência incorporada automaticamente e nenhuma afirmação de aprovação nos casos de avaliação.

## 11 Geração de documentos e operação

Gerar calendário anual/mensal com identificação de campus, ano, cursos/ofertas, períodos, dias, legenda e eventos; relatório de contagem por curso/período; checklist com referências; pendências e exceções; registro de versão e arquivos de apoio ao encaminhamento. A exportação oficial exige o modelo gráfico da PROENS. Não reconstruir logomarca, assinatura ou layout presumindo fidelidade.

No MVP, prever PDF e formato editável após conferir o modelo recebido. Ambos devem derivar dos mesmos dados e preservar dias/eventos e legenda. Testar meses com seis linhas, eventos longos, feriados simultâneos, múltiplas ofertas e impressão sem cor. Não apresentar um arquivo editado fora do sistema como ainda coberto por validação anterior.

Produção requer ambientes separados, segredos no servidor, HTTPS, autorização em todas as rotas, armazenamento privado, registro de acesso e proteção contra uploads indevidos. Definir com a instituição retenção, descarte, operadores e tratamento de dados; esta especificação não fixa política jurídica ou prazo sem decisão institucional.

Backups devem ser restaurados em teste antes do piloto. Monitorar falhas de extração, validação, exportação e acessos negados sem registrar conteúdo sensível desnecessário. Registrar versão de aplicação, motor, pacote normativo e modelo gráfico em cada resultado. GitHub pode guardar o código; documentos reais e credenciais ficam fora do repositório.

## 12 Roadmap e aceite

Etapa A, base para desenvolvimento: esta especificação, contrato inicial e núcleo testado. Entregue como scaffold local. Ainda falta interface e integração; não existe ambiente institucional publicado.

Etapa B, MVP sem dependência de IA: implementar identidade/vínculos, banco, cadastro anual de documentos/regras, editor manual por oferta, cálculo completo, checklist com revisão humana, versões e exportação pelo modelo oficial. Aceite: dois calendários de ofertas diferentes conferidos pela DENTEC, totais reconciliados data a data e acesso cruzado entre campi impedido em testes.

Etapa C, assistência documental: uploads, OCR, matriz histórica, recuperação de evidências, candidatos a feriados de fontes oficiais e sugestões de IA. Aceite: nenhum dado extraído aplicado sem confirmação; erro de OCR recuperável; isolamento por campus também no contexto da IA; referências verificáveis.

Etapa D, piloto institucional: grupo de campi definido pela DENTEC, testes do fluxo de envio, acessibilidade, concorrência, restauração e qualidade visual. Aceite: 100% dos itens aplicáveis do parecer mapeados como automatizados ou humanos, nenhuma pendência obrigatória escondida e exportações verificadas pelo responsável institucional.

Etapa E, produção: hospedagem aprovada pela TI, identidade institucional integrada, operação/backups testados, documentação de suporte, acompanhamento de incidentes e atualização anual controlada. Integração SEI e publicação automática ficam para fase posterior específica.

Pendências concretas para avançar: recuperar calendário de referência e parecer completos; obter modelo gráfico/editável; confirmar cadastro de campi/ofertas; identificar provedor de login e hospedagem com a TI; ratificar convenção de semanas, critérios humanos e política de exceções. Não é necessário decidir tudo para desenvolver o núcleo e o editor manual.

Plano de testes do produto: ano bissexto; datas inválidas; intervalos inclusivos; sobreposição; dias duplicados; férias/recessos; inclusão letiva em feriado; mínimos por semestre; escopos de oferta; feriado municipal não confirmado; deslocamento de prazo; antecedência atravessando ano; alteração após validação; extração incorreta; isolamento de campus; exportação consistente. O scaffold executa apenas o subconjunto descrito no README e nos testes, sem alegar cobertura de todo esse plano.

Referências técnicas consultadas: PostgreSQL, políticas de linhas, https://www.postgresql.org/docs/current/ddl-rowsecurity.html; Node.js, test runner, https://nodejs.org/download/release/v22.17.0/docs/api/test.html. A leitura da resolução serve à especificação institucional; não substitui parecer jurídico nem acrescenta regras de fontes externas.
