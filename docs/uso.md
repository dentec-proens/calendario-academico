# Uso da aplicação

## Navegação

A barra lateral reúne **Calendários e referências** (Calendários, Documentos e normas e Feriados e eventos institucionais), com uma única tela por assunto. As ações e os filtros variam conforme as permissões: CAMPUS trabalha em sua unidade e consulta a base disponibilizada; ADMIN pode selecionar outros campi e manter a base. O grupo **Administração** reúne Revisões e pareceres, Campi, Contas e acessos e Usuários online para ADMIN; PARECERISTA acessa somente Revisões e pareceres nesse grupo. Em telas pequenas, use **Navegação** para abrir o menu.

As coleções abrem pela lista. Use **Novo calendário**, **Cadastrar campus**, **Nova conta**, **Adicionar documento** ou **Novo evento institucional** para abrir o formulário correspondente. **Voltar à lista** preserva os campos em preenchimento na sessão. A troca de seções também preserva esses campos; recarregar ou sair da página pode descartá-los.

Seções, formulários e análises têm URLs próprias: por exemplo, `/calendarios`, `/calendarios/novo`, `/documentos`, `/campi/novo`, `/contas/nova` e `/revisoes/<id>`. A edição de um evento institucional usa `/eventos-institucionais/<id>/editar`. Copie o endereço para compartilhar a tela com outra pessoa autorizada ou salve-o nos favoritos. Voltar e Avançar do navegador percorrem essas telas. Recarregar mantém o destino da URL, mas não os campos ainda não aplicados. Abrir um link continua exigindo autenticação e as permissões correspondentes.

O editor orienta a elaboração em seis etapas: **Semana letiva**, **Períodos e avaliações**, **Sábados letivos**, **Férias docentes**, **Atividades e datas do campus** e **Revisão e conclusão**. Os títulos da navegação, do conteúdo e dos botões de avanço vêm da mesma definição de etapas. Use **Continuar para…**, seguido do título da próxima etapa, para seguir o percurso ou a navegação lateral para revisar outra etapa. Em telas pequenas, toque no nome da etapa para abrir o seletor. **Visualizar calendário**, no topo, abre a prévia anual. Campos ainda não aplicados permanecem em memória ao trocar de seção; a navegação lateral não os salva.

Campus, ano, forma de oferta e organização aparecem no cabeçalho do calendário, disponíveis em todas as etapas. A primeira etapa, **Semana letiva**, concentra os dias regulares e a referência da decisão. **Referência da decisão** identifica o documento ou registro que definiu a semana letiva da oferta: por exemplo, uma resolução, portaria ou ata, com número, ano ou outra identificação consultável. **Continuar para períodos e avaliações** valida e aplica a semana letiva antes de avançar. As contagens de dias e períodos, as pendências, a exportação e **Concluir e tornar definitivo** ficam na etapa **Revisão e conclusão**. A conversão mantém os dados editáveis e não representa aprovação institucional. O menu **Mais ações**, no topo, reúne o histórico de alterações, a importação e o download de cópias, com descrições das opções.

Cada seção do editor usa um endereço sob `/calendarios/<id>/`, terminando em `editar`, `periodos`, `avaliacoes`, `dias`, `ferias`, `eventos`, `pendencias` ou `visualizar`. O endereço antigo `avaliacoes` abre o bloco de avaliações dentro de `periodos`. Endereços antigos terminados em `historico` continuam válidos e levam à etapa **Atividades e datas do campus**.

Na lista de calendários, **Editar** abre a edição. **Criado por** identifica a autoria original e **Última alteração por** identifica quem alterou a versão atual, junto da data e hora. A atribuição vem do histórico de operações do próprio calendário; uploads, pareceres e operações de lixeira não substituem a autoria da última alteração de conteúdo. Quando a evidência não existe para a criação ou para a versão atual, aparece **Autoria não registrada**.

## Atualização do portal

O portal verifica se há uma nova versão publicada. O aviso **Uma nova versão do portal está disponível** permite atualizar quando não há trabalho pendente. Uma aba limpa também pode atualizar ao clicar em outra seção do menu principal. Trocas de etapa do calendário e a saída do editor seguem seu fluxo habitual; salvar e sair não autoriza uma atualização no mesmo clique.

No acesso, a operação do Google não acrescenta uma confirmação de saída. Se você já preencheu campos do acesso local, a proteção desses campos continua ativa ao trocar para Google; escolher ficar na página conserva o preenchimento. Limpe os campos locais se quiser abandoná-los antes de iniciar o outro método de acesso.

Com campos em preenchimento, pareceres não salvos, arquivos selecionados, operações em andamento ou recuperação de acesso, a aba permanece aberta. Use **Voltar ao preenchimento pendente** ou o menu para retornar ao fluxo e aplicar, salvar ou descartar explicitamente seus dados. O botão **Atualizar agora** não envia nem descarta formulários. Filtros de consulta não impedem a atualização. Ativação e recuperação de senha precisam ser concluídas antes de trocar a página.

Se uma tentativa carregar novamente a versão anterior, o aviso orienta uma nova tentativa manual e suspende as trocas automáticas nessa página. **Reabrir calendário atualizado**, quando há dados remotos mais recentes, adota esses dados na sessão atual após a confirmação de descarte dos campos locais; os demais preenchimentos do portal permanecem protegidos.

Durante **Atualizando portal…**, os controles ficam temporariamente bloqueados. Se o carregamento demorar dez segundos, **Cancelar atualização** interrompe a navegação e permite continuar nesta aba. Uma nova tentativa exige outro gesto e nova verificação. Se a navegação falhar e o aviso continuar, use esse cancelamento antes de voltar a editar.

Se uma tela não carregar seus arquivos, **Tentar novamente** usa o mesmo endereço dos arquivos. O editor e os preenchimentos das outras telas permanecem na mesma sessão. Alguns erros de módulo ficam memorizados pelo navegador: se a tentativa não resolver, volte ao trabalho pendente, conclua-o e use a atualização protegida. Manter a página aberta preserva os dados em memória; encerrar o processo, descartar a aba ou perder energia ainda pode perdê-los. Abas abertas antes da primeira publicação deste mecanismo precisam de um primeiro acesso ou recarregamento para recebê-lo.

## Perfis e criação

ADMIN acessa todos os campi, gerencia contas e base institucional e registra a revisão técnico-pedagógica. CAMPUS consulta a base e cria, altera, exporta, exclui e restaura calendários da unidade autorizada. PARECERISTA consulta os calendários de todos os campi e as referências publicadas, registra revisões e emite pareceres, sem alterar calendários, base institucional ou contas. A autorização é conferida no backend.

No painel de revisão, **Abrir calendário em outra aba** permite ao PARECERISTA consultar o calendário anual, os dados, eventos, PDFs anteriores e pendências em modo somente leitura. A navegação, a impressão e a exportação permanecem disponíveis; os controles de edição e o salvamento ficam desativados. Alterações recebidas do campus atualizam a consulta automaticamente.

Em **Contas e acessos**, o ADMIN pode escolher o perfil ao lado de cada conta e clicar em **Salvar perfil**. CAMPUS exige uma unidade ativa; ADMIN e PARECERISTA têm escopo institucional. A troca preserva a senha, fica registrada nos logs e encerra as sessões do usuário, que deverá entrar novamente. O sistema impede retirar o perfil do último administrador ativo. O perfil muda somente por uma alteração explícita.

Em **Calendários → Novo calendário**, informe campus, ano, formas de oferta, organização, cursos e, opcionalmente, turmas e turnos. O nome é preenchido a partir de campus e ano. Um calendário pode combinar Técnico integrado, Técnico subsequente, Graduação e Pós-graduação, com etapas próprias por oferta.

Teste e definitivo são finalidades do calendário, não estados de aprovação. Um teste pode ser convertido em definitivo preservando os dados e o histórico e continua editável.

## Construção e contagem

Confirme a semana letiva e registre os períodos, eventos locais e fontes das decisões. Cada evento possui categoria/cor, ofertas abrangidas e efeito: incluir dias, excluir dias ou somente registrar. A cor não determina se ele entra na contagem.

O cálculo usa datas civis, intervalos inclusivos e o escopo de cada oferta. Dias não são contados duas vezes. Uma exclusão prevalece sobre uma inclusão na mesma data e gera conflito para conferência. Em **Sábados letivos**, um calendário anual mostra os doze meses com a coluna de sábado destacada, os sábados já registrados, os impedimentos que tornam uma data não letiva e os sábados fora dos períodos letivos, que não podem ser selecionados. Marque um ou mais sábados, de qualquer mês, e informe no painel ao lado uma atividade e uma fonte da decisão que valem para toda a seleção; a fonte vem preenchida com a última usada e as atividades já registradas aparecem como sugestão. Use **Adicionar** para confirmar a inclusão; para dar informações diferentes a datas diferentes, adicione-as em lotes separados. Clique em um sábado registrado para editar a atividade e a fonte ou removê-lo na própria etapa; inclusões de vários dias continuam sendo editadas em **Atividades e datas do campus**. O topo do painel mostra a contagem de dias letivos de cada oferta e quanto ela passa a ser com a seleção. Em telas estreitas, uma barra fixa abre o painel em uma janela sobre o calendário. Fechar pelo **X** ou por **Esc** conserva a seleção e os campos em memória nesta sessão. Ao editar um sábado registrado, reabra a mesma data para continuar o preenchimento. **Descartar alterações** limpa o preenchimento pendente; **Remover sábado** exclui o registro aplicado. A seleção fica em preenchimento até a confirmação; sábados não são incluídos automaticamente para completar metas.

As metas automáticas de 200 dias anuais e 100 por período semestral estão configuradas para 2027, exceto Pós-graduação. Outros anos e ofertas sem meta não recebem conformidade presumida. Os totais por oferta, período e dia da semana ajudam na conferência; não comprovam carga horária curricular nem atendimento integral à norma.

Informe até três períodos de férias docentes, com datas e fonte. A prévia mostra o total de dias corridos; não há imposição de janeiro ou julho no formulário. Férias excluem os dias correspondentes da contagem.

Em **Períodos e avaliações**, cadastre as datas de aulas e escolha as ofertas e o ciclo (ano letivo, 1º ou 2º semestre). Essa escolha define a organização de cada oferta, sem uma aplicação separada. Um calendário pode reunir integrado anual e graduação semestral com datas coincidentes entre ofertas. Dentro da mesma oferta, os períodos não podem se sobrepor. Cursos da mesma oferta com organizações distintas precisam de calendários separados. Ciclos conflitantes pedem a revisão dos registros existentes, sem apagar datas ou vínculos.

A etapa apresenta dois cards empilhados: **Períodos letivos** e **Etapas de avaliação**, com títulos, bordas e espaçamento próprios.

O nome, o início e o término identificam o período. **Quantidade de dias letivos** é opcional: ao preenchê-la, o término é calculado usando a semana letiva e os impedimentos registrados. Períodos legados ambíguos são classificados pelo próprio editor de períodos, conservando IDs e datas. Navegar para outra etapa conserva o preenchimento em memória; **Descartar alterações** limpa os campos pendentes sem excluir um período já aplicado.

**Norma aplicável ao calendário** fica em **Revisão e conclusão**. Confirme a aplicação da Resolução 292 com uma referência do curso ou da decisão; informações já gravadas são preservadas. Calendários sujeitos a norma própria continuam sem conclusão automática pelas regras da Resolução 292.

Em **Atividades e datas do campus**, abra **Matrícula de ingressantes** e, quando necessário, **Exigência por regra local**. **Exigir esta atividade no calendário** pede uma referência e vale somente para a oferta e o ciclo selecionados. Sem configuração não há exigência automática nem declaração de ausência de ingresso. Exigências anteriores continuam valendo; as regras de veteranos permanecem independentes.

## Etapas de avaliação

Configure duas, três ou quatro etapas por oferta. Com semana e períodos confirmados, o início da primeira etapa permite sugerir a distribuição dos intervalos. A sugestão considera dias letivos, exclusões e sábados registrados, respeitando os limites dos períodos quando a distribuição permite. Confira datas, fonte e ofertas antes de aplicar.

Períodos com meta de dias recalculam o término ao alterar os impedimentos. Etapas vinculadas a esse ajuste ou a sugestões automáticas podem ser redistribuídas; datas manuais não são substituídas indiscriminadamente. **Recalcular datas das etapas** redistribui as etapas preenchidas e ativa o ajuste. Confira os intervalos e prazos relacionados após mudanças.

## Salvamento, cópias e conflitos

**Adicionar/Aplicar**, ou **Continuar para períodos e avaliações** na primeira etapa, inclui o formulário no calendário e inicia o salvamento. O rodapé da etapa distingue gravação pendente, em andamento, confirmada e falha. A confirmação **Alterações salvas** aparece somente após a resposta do servidor. Falhas, conflitos e campos ainda em edição recebem aviso na área superior, que permanece visível durante a rolagem. Campos ainda em edição não fazem parte do estado salvo até serem aplicados.

Em falha recuperável, use **Tentar novamente**. Conflito de versões ou sessão expirada preserva as alterações na tela; siga a orientação para guardar uma cópia e conferir a versão atual antes de continuar. Atualizações recebidas de outra sessão não substituem campos não aplicados. Durante falta de conexão, mantenha a página aberta até a confirmação; não existe armazenamento offline durável.

**Sair**, no cabeçalho, pede confirmação quando há alterações no editor e aguarda o salvamento das alterações aplicadas antes de encerrar a conta. A confirmação informa quando campos ainda não aplicados serão descartados; **Cancelar** mantém o preenchimento.

Se o acesso expirar, o editor permanece bloqueado nesta aba. **Baixar cópia aplicada** guarda o estado aplicado em JSON. **Entrar novamente** permite retomar o preenchimento com a mesma conta; trocar de conta, perfil ou campus limpa os dados locais da identidade anterior. **Descartar e ir para acesso** exige confirmação e remove as alterações locais. Recarregar ou fechar a aba não preserva esses dados.

**Baixar cópia** gera JSON do estado aplicado, não dos campos ainda em edição. **Importar cópia** abre um JSON compatível e substitui o rascunho da sessão após confirmação. A importação também precisa ter seu salvamento confirmado.

As novas cópias usam o formato v3. Uma cópia v2 é convertida explicitamente, conservando eventos, datas e procedência. Ingresso e publicação não são deduzidos pelo nome do evento. Um cliente antigo não pode sobrescrever conteúdo já salvo como v3; atualize a aplicação e conserve o preenchimento antes de retomar.

## Base institucional e documentos

Em **Documentos e normas** e **Feriados e eventos institucionais**, CAMPUS consulta a base disponibilizada e ADMIN também acessa as ações de manutenção. Em Documentos e normas, ambos podem filtrar por ano; ADMIN pode filtrar por situação (rascunho, vigente ou arquivado). Esses filtros são aplicados antes da paginação. As mesmas telas atendem os dois perfis. Eventos indicam datas, categoria, efeito, ofertas e fonte. Mudanças na revisão institucional exigem conferir o impacto e confirmar a atualização no calendário; uma análise humana anterior pode ficar desatualizada.

Na lista, cada documento destaca título, situação, ano, tipo, versão e origem. **Visualizar PDF** abre o leitor na própria aplicação, com paginação, ampliação e texto extraído da página quando disponível. **Voltar à lista** ou Escape fecha a leitura e preserva os filtros. O leitor também permite abrir o original em outra aba e baixar uma cópia como ação secundária. **Detalhes** reúne nome do arquivo, tamanho e data de envio. Um original aguardando restauração é sinalizado e não pode ser aberto até sua recuperação.

Documentos aceitam PDF de até 8 MB, com título, ano, tipo e fundamento de aplicação. O envio cria um rascunho. ADMIN encontra as ações em **Gerenciar**: após visualizar e conferir arquivo, ano e aplicabilidade, marque a conferência e use **Definir como vigente**. Há uma versão vigente por tipo e ano; a anterior é arquivada e preservada. **Retirar de vigência** exige confirmação e preserva o documento no histórico. A restauração de originais indisponíveis também fica em **Gerenciar**.

Enviar um documento não atualiza automaticamente datas, regras de cálculo ou critérios de revisão. Eventos são mantidos no catálogo; mudanças no motor exigem implementação e verificação.

## Atividades, editais e referências

A etapa 5 tem duas abas: **Atividades/Eventos da Resolução** e **Atividades/Eventos do Campus**. O envio e a extração de calendários anteriores foram retirados. Registros já gravados conservam sua procedência e podem ser editados normalmente. A aba escolhida, a busca, a situação, a oferta e o assunto ficam na URL; valores inválidos voltam ao padrão.

**Atividades/Eventos da Resolução** mostra o progresso por oferta e uma linha por atividade, agrupada em **Ingresso e vida acadêmica**, **Registros e prazos docentes**, **Atividades e semanas do campus** e **Outros eventos e impedimentos**. Por padrão, a lista exibe só o que está **a preencher** (pendente, parcial ou com aplicação a confirmar); **Mostrar todas** ou o filtro **Situação** exibem as completas e opcionais. Oferta e assunto ficam em **Mais filtros**.

Todos os formulários abrem no mesmo **painel lateral**, que mantém a lista visível e fecha com o botão ✕ ou a tecla Esc. Clicar numa atividade sem registros abre direto o preenchimento; com registros, o painel mostra a situação, o fundamento, os registros (com **Editar** e **Remover**) e **Adicionar outro período**. **Situação por oferta e conferência** detalha aplicabilidade, cobertura e conferência humana; o detalhe abre sozinho quando as ofertas divergem, há problema ou a atividade foi aberta por um link da revisão. Descrição, categoria e efeito vêm preenchidos em **Mais opções**. **Alterar vínculo** escolhe outra atividade ou deixa o registro sem vínculo; etapas de avaliação são vinculadas na etapa 2, que usa o mesmo painel. Na edição, os valores gravados são preservados. Um evento só atende as ofertas explicitamente abrangidas.

**Atividades/Eventos do Campus** reúne feriados, recessos, reposições, eventos e prazos sem atividade correspondente, além do Dia do Professor. A listagem usa as mesmas linhas compactas das atividades da Resolução: descrição, situação, datas e seta. Clique em uma linha para consultar os detalhes e as ações **Editar evento** e **Remover** no painel lateral. O Dia do Professor abre seu ajuste de data no mesmo painel, com o intervalo permitido abaixo do campo. Fechar conserva a data ainda não aplicada; **Descartar alterações** abandona esse preenchimento. **Restaurar data institucional** continua aplicando a data da base ao calendário. Pessoas com acesso somente de leitura também podem abrir os detalhes; as ações de alteração ficam desabilitadas. **Adicionar novo evento** pergunta **O que é este evento?**; a resposta define o efeito na contagem e a categoria, ajustáveis em **Mais opções**. Para referenciar um fato anterior sem PDF, use **Intenção do registro**. A lista consolidada de registros institucionais e locais fica em **Visualizar calendário**; registros locais podem ser abertos para edição conforme a permissão da pessoa.

Para um edital, informe tipo, situação de publicação e destino do ingresso separadamente das datas. **Publicação prevista** pode completar o planejamento após conferência; não comprova execução. **Publicação realizada** conserva data real e fonte. A passagem do tempo não transforma previsão em realização. Referências anteriores são informativas, sem efeito em dias letivos, horas, férias ou etapas atuais.

Exemplos: um edital publicado em dezembro de 2026 para ingresso em 2027 conserva a data de 2026. Uma publicação em dezembro de 2027 para ingresso em 2028 conserva dezembro; no processo seletivo regular, o prazo de referência é 15/06/2027, e o ajuste exige fonte da Proens e conferência. O prazo institucional não é prova de publicação realizada. Intervalos informativos que atravessam a virada conservam as duas datas.

Um feriado municipal ou recesso decorrente pode identificar expressamente a causa e sua fonte. Para prazos do calendário de referência abrangidos pelo art. 3º, § 2º, a política consulta o primeiro dia letivo subsequente por oferta, sem alterar a data cadastrada do fato. Uma exclusão genérica não comprova essa causa; a extensão não é aplicada automaticamente aos prazos do art. 11.

O painel mantém um formulário ativo. **X** e **Esc** fecham o painel e conservam o rascunho em memória, retomável por **Continuar preenchimento**. **Descartar alterações** aparece quando há campos alterados e limpa somente o preenchimento pendente, sem remover um registro já aplicado. Se a sessão expirar com o painel aberto, ele se fecha e o rascunho é conservado. Aplicar altera o calendário local, e somente a confirmação do servidor comprova a gravação. Filtros de consulta não alteram as ofertas preenchidas.

## Revisão e saídas

Em **Revisões e pareceres**, ADMIN abre a análise, confere as indicações e confirma os critérios. A busca por nome/categoria apenas localiza candidatos; não comprova atendimento ou ausência documental. As situações humanas são Pendente, Atendido, Não atendido e Não aplicável. A conclusão é um texto proposto que o parecerista pode editar.

O roteiro de 2027 usa a Resolução CONSUP/IFPR nº 292, de 5 de outubro de 2026, SEI 4422750, com política compartilhada entre editor, revisão, backend e documentos. O roteiro de 2026 continua separado. Pós-graduação depende de norma própria; o modelo ainda não identifica EaD e qualificação separadamente. Não se presume conformidade nesses escopos. A primeira/segunda semana das atividades tem mês validado e conferência humana, pois a resolução não define seu intervalo operacional.

Uma revisão que não avaliou o conjunto vigente de regras de 2027 fica desatualizada mesmo sem alteração das datas ou do número da base. Revisões e snapshots anteriores permanecem preservados.

**Salvar análise** é explícito e registra autoria e versões. Alterações posteriores no calendário ou na base tornam a revisão desatualizada e exigem reavaliação. A exportação do parecer requer revisão salva e atual e oferece prévia, HTML, texto e cópia para a área de transferência. Confira a formatação ao colar no SEI; assinatura e tramitação ocorrem fora da aplicação.

O PDF de teste é identificado como tal. Um calendário definitivo com pendências pode gerar uma **cópia da proposta para análise**, sem aprovação. A saída definitiva depende de contagem válida, ausência de conflitos, base atual, roteiro e fontes completos e revisão humana atualizada com os critérios atendidos ou não aplicáveis confirmados. Os impedimentos e alertas vêm das verificações implementadas; não constituem aprovação institucional.

O PDF conserva a grade do ano do calendário. **Atividades e referências de outros anos** apresenta datas integrais, fontes e finalidade, separando previsões de fatos anteriores. Um intervalo que cruza o ano também mostra suas datas integrais na parte correspondente da grade. A finalidade de ingresso futuro aparece junto da publicação, sem mudar sua data.

## Lixeira e histórico

**Excluir calendário** move o registro para a lixeira após confirmação. Ele sai das listas de trabalho e revisão; dados, versões e documentos são preservados. A exclusão exige a versão atual. **Restaurar calendário** devolve o registro ao trabalho, dentro do mesmo escopo de acesso. Não há descarte físico automático.

**Histórico de alterações** consulta operações salvas com autoria e contexto autorizado. Campos em edição que ainda não foram gravados não aparecem no histórico.

## Usuários online

A aba **Usuários online**, exclusiva do ADMIN, mostra nome, e-mail, campus e perfil das pessoas conectadas. A lista e os totais de pessoas e campi se atualizam automaticamente; a busca por nome/e-mail e o filtro por campus restringem a lista.

A presença é acompanhada no portal e no editor de calendários. Cada pessoa conta uma vez, mesmo com várias abas ou dispositivos. Fechar a última aba ou sair da conta encerra a presença; em perda abrupta de conexão, a remoção ocorre após cerca de 90 segundos sem confirmação. **Última presença: Agora** indica conexão recente, não interação contínua com o sistema. Uma sessão de login válida, sozinha, não torna a pessoa online.

## Formulários e manutenção

Erros de campo aparecem junto ao preenchimento; erros de operação preservam os valores para correção ou nova tentativa. Um campo válido não comprova salvamento. Arquivos selecionados não são preservados quando o fluxo é desmontado; selecione-os novamente ao retornar.

Durante manutenção, novas alterações e processamento ficam indisponíveis no backend. Aguarde a liberação e recarregue a página para usar o código publicado. Não repita envios enquanto o resultado anterior estiver incerto; confira o estado do registro após a retomada.
