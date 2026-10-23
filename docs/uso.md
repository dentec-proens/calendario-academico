# Uso da aplicação

## Navegação

A barra lateral reúne **Calendários e referências** (Calendários, Documentos e normas e Feriados e eventos institucionais), com uma única tela por assunto. As ações e os filtros variam conforme as permissões: CAMPUS trabalha em sua unidade e consulta a base disponibilizada; ADMIN pode selecionar outros campi e manter a base. O grupo **Administração**, exclusivo do ADMIN, reúne Revisões e pareceres, Campi, Contas e acessos e Usuários online. Em telas pequenas, use **Navegação** para abrir o menu.

As coleções abrem pela lista. Use **Novo calendário**, **Cadastrar campus**, **Nova conta**, **Adicionar documento** ou **Novo evento institucional** para abrir o formulário correspondente. **Voltar à lista** preserva os campos em preenchimento na sessão. A troca de seções também preserva esses campos; recarregar ou sair da página pode descartá-los.

O editor está dividido em **Dados gerais**, **Períodos e avaliações**, **Sábados e férias**, **Eventos locais**, **Calendário anterior** e **Conferência e exportação**. As seções podem ser acessadas em qualquer ordem. **Visualizar calendário** abre a prévia anual. Campos ainda não aplicados permanecem em memória ao trocar de seção; a troca de seção não os salva.

## Perfis e criação

ADMIN acessa todos os campi, gerencia contas e base institucional e registra a revisão técnico-pedagógica. CAMPUS consulta a base e cria, altera, exporta, exclui e restaura calendários da unidade autorizada. A autorização é conferida no backend.

Em **Calendários → Novo calendário**, informe campus, ano, formas de oferta, organização, cursos e, opcionalmente, turmas e turnos. O nome é preenchido a partir de campus e ano. Um calendário pode combinar Técnico integrado, Técnico subsequente, Graduação e Pós-graduação, com etapas próprias por oferta.

Teste e definitivo são finalidades do calendário, não estados de aprovação. Um teste pode ser convertido em definitivo preservando os dados e o histórico e continua editável.

## Construção e contagem

Confirme a semana letiva e registre os períodos, eventos locais e fontes das decisões. Cada evento possui categoria/cor, ofertas abrangidas e efeito: incluir dias, excluir dias ou somente registrar. A cor não determina se ele entra na contagem.

O cálculo usa datas civis, intervalos inclusivos e o escopo de cada oferta. Dias não são contados duas vezes. Uma exclusão prevalece sobre uma inclusão na mesma data e gera conflito para conferência. Sábados letivos devem ser escolhidos e confirmados pelo campus, com fonte; não são incluídos automaticamente para completar metas.

As metas automáticas de 200 dias anuais e 100 por período semestral estão configuradas para 2027, exceto Pós-graduação. Outros anos e ofertas sem meta não recebem conformidade presumida. Os totais por oferta, período e dia da semana ajudam na conferência; não comprovam carga horária curricular nem atendimento integral à norma.

Informe até três períodos de férias docentes, com datas e fonte. A prévia mostra o total de dias corridos; não há imposição de janeiro ou julho no formulário. Férias excluem os dias correspondentes da contagem.

## Etapas de avaliação

Configure duas, três ou quatro etapas por oferta. Com semana e períodos confirmados, o início da primeira etapa permite sugerir a distribuição dos intervalos. A sugestão considera dias letivos, exclusões e sábados registrados, respeitando os limites dos períodos quando a distribuição permite. Confira datas, fonte e ofertas antes de aplicar.

Períodos com meta de dias recalculam o término ao alterar os impedimentos. Etapas vinculadas a esse ajuste ou a sugestões automáticas podem ser redistribuídas; datas manuais não são substituídas indiscriminadamente. **Recalcular datas das etapas** redistribui as etapas preenchidas e ativa o ajuste. Confira os intervalos e prazos relacionados após mudanças.

## Salvamento, cópias e conflitos

**Adicionar/Aplicar** inclui o formulário no calendário e inicia o autosave. O indicador permanece visível durante a rolagem e distingue gravação pendente, em andamento, confirmada e falha. Campos ainda em edição têm aviso próprio: não fazem parte do estado salvo até serem aplicados.

Em falha recuperável, use **Tentar novamente**. Conflito de versões ou sessão expirada preserva as alterações na tela; siga a orientação para guardar uma cópia e conferir a versão atual antes de continuar. Atualizações recebidas de outra sessão não substituem campos não aplicados. Durante falta de conexão, mantenha a página aberta até a confirmação; não existe armazenamento offline durável.

**Baixar cópia** gera JSON do estado aplicado, não dos campos ainda em edição. **Importar cópia** abre um JSON compatível e substitui o rascunho da sessão após confirmação. A importação também precisa ter seu salvamento confirmado.

## Base institucional e documentos

Em **Documentos e normas** e **Feriados e eventos institucionais**, CAMPUS consulta a base disponibilizada e ADMIN também acessa as ações de manutenção. Em Documentos e normas, ambos podem filtrar por ano; ADMIN pode filtrar por situação (rascunho, vigente ou arquivado). Esses filtros são aplicados antes da paginação. As mesmas telas atendem os dois perfis. Eventos indicam datas, categoria, efeito, ofertas e fonte. Mudanças na revisão institucional exigem conferir o impacto e confirmar a atualização no calendário; uma análise humana anterior pode ficar desatualizada.

Documentos aceitam PDF de até 8 MB, com título, ano, tipo e fundamento de aplicação. O envio cria um rascunho. Após baixar e conferir arquivo, ano e aplicabilidade, marque a conferência e use **Definir como vigente**. Há uma versão vigente por tipo e ano; a anterior é arquivada e preservada.

Enviar um documento não atualiza automaticamente datas, regras de cálculo ou critérios de revisão. Eventos são mantidos no catálogo; mudanças no motor exigem implementação e verificação.

## Calendário anterior

**Enviar calendário anterior** vincula o PDF ao calendário e inicia a identificação de datas e atividades. São aceitos PDFs de até 8 MB e 30 páginas, com texto selecionável. A extração apresenta até 150 sugestões, com origem e página, e pode omitir ou juntar trechos. Não há OCR de imagens nem uso de um modelo de IA para validar o conteúdo.

Use **Revisar e incluir** para conferir descrição, datas do ano atual, fonte vigente, ofertas e efeito na contagem. A inclusão depende de confirmação; o documento anterior não comprova vigência atual. Sugestões já atendidas por eventos podem ser consultadas pelo filtro correspondente. Falha na leitura não remove o arquivo enviado.

## Revisão e saídas

Em **Revisões e pareceres**, ADMIN abre a análise, confere as indicações e confirma os critérios. A busca por nome/categoria apenas localiza candidatos; não comprova atendimento ou ausência documental. As situações humanas são Pendente, Atendido, Não atendido e Não aplicável. A conclusão é um texto proposto que o parecerista pode editar.

O roteiro de revisão usa o Parecer SEI 3959640, de 2026; a interface alerta para outro ano. A apresentação da norma de 2027 usa a Resolução CONSUP/IFPR nº 292, de 5 de outubro de 2026, mas essa identificação não converte os critérios de 2026 em regras completas para outros anos. A norma aplicável e as evidências devem ser conferidas pelo responsável.

**Salvar análise** é explícito e registra autoria e versões. Alterações posteriores no calendário ou na base tornam a revisão desatualizada e exigem reavaliação. A exportação do parecer requer revisão salva e atual e oferece prévia, HTML, texto e cópia para a área de transferência. Confira a formatação ao colar no SEI; assinatura e tramitação ocorrem fora da aplicação.

O PDF de teste é identificado como tal. Um calendário definitivo com pendências pode gerar uma **cópia da proposta para análise**, sem aprovação. A saída definitiva depende de contagem válida, ausência de conflitos, base atual, roteiro e fontes completos e revisão humana atualizada com os critérios atendidos ou não aplicáveis confirmados. Os impedimentos e alertas vêm das verificações implementadas; não constituem aprovação institucional.

## Lixeira e histórico

**Excluir calendário** move o registro para a lixeira após confirmação. Ele sai das listas de trabalho e revisão; dados, versões e documentos são preservados. A exclusão exige a versão atual. **Restaurar calendário** devolve o registro ao trabalho, dentro do mesmo escopo de acesso. Não há descarte físico automático.

**Histórico de alterações** consulta operações salvas com autoria e contexto autorizado. Campos em edição que ainda não foram gravados não aparecem no histórico.

## Usuários online

A aba **Usuários online**, exclusiva do ADMIN, mostra nome, e-mail, campus e perfil das pessoas conectadas. A lista e os totais de pessoas e campi se atualizam automaticamente; a busca por nome/e-mail e o filtro por campus restringem a lista.

A presença é acompanhada no portal e no editor de calendários. Cada pessoa conta uma vez, mesmo com várias abas ou dispositivos. Fechar a última aba ou sair da conta encerra a presença; em perda abrupta de conexão, a remoção ocorre após cerca de 90 segundos sem confirmação. **Última presença: Agora** indica conexão recente, não interação contínua com o sistema. Uma sessão de login válida, sozinha, não torna a pessoa online.
