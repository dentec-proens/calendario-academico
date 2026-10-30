# Uso da aplicação

## Navegação

A barra lateral reúne **Calendários e referências** (Calendários, Documentos e normas, Feriados e eventos institucionais e Regras do calendário), com uma única tela por assunto. As ações e os filtros variam conforme as permissões: CAMPUS trabalha em sua unidade e consulta a base disponibilizada; ADMIN pode selecionar outros campi e manter a base. O grupo **Administração** reúne Revisões e pareceres, Campi, Contas e acessos e Usuários online para ADMIN; PARECERISTA acessa somente Revisões e pareceres nesse grupo. Em telas pequenas, use **Navegação** para abrir o menu.

As coleções abrem pela lista. Use **Novo calendário**, **Cadastrar campus**, **Nova conta**, **Adicionar documento** ou **Novo evento institucional** para abrir o formulário correspondente. **Voltar à lista** preserva os campos em preenchimento na sessão. A troca de seções também preserva esses campos; recarregar ou sair da página pode descartá-los.

Seções, formulários e análises têm URLs próprias: por exemplo, `/calendarios`, `/calendarios/novo`, `/documentos`, `/campi/novo`, `/contas/nova` e `/revisoes/<id>`. A edição de um evento institucional usa `/eventos-institucionais/<id>/editar`. Copie o endereço para compartilhar a tela com outra pessoa autorizada ou salve-o nos favoritos. Voltar e Avançar do navegador percorrem essas telas. Recarregar mantém o destino da URL, mas não os campos ainda não aplicados. Abrir um link continua exigindo autenticação e as permissões correspondentes.

O editor orienta a elaboração em seis etapas: **Semana letiva**, **Organização letiva por oferta**, **Sábados letivos**, **Férias docentes**, **Atividades e datas do campus** e **Revisão e conclusão**. Os títulos da navegação, do conteúdo e dos botões de avanço vêm da mesma definição de etapas. Use **Continuar para…**, seguido do título da próxima etapa, para seguir o percurso ou a navegação lateral para revisar outra etapa. Em telas pequenas, toque no nome da etapa para abrir o seletor. **Visualizar calendário**, no topo, abre a prévia anual. O topo reúne a identificação, a versão, a situação e as ofertas em formato compacto. A faixa **Dias letivos** permanece visível durante a rolagem em todas as etapas, inclusive no celular. Ela mostra lado a lado as ofertas e seus totais anuais, com divisórias entre elas; no celular, distribui as ofertas em colunas. Abra **Detalhes** para consultar os dias de cada período. A referência normativa só aparece quando configurada para aquele escopo; ofertas sem períodos mostram a pendência em vez de zero. A contagem acompanha os dados aplicados ao calendário; campos em preenchimento e a seleção ainda não confirmada de sábados não entram no total. Os detalhes informam quando há alterações aguardando confirmação de salvamento. Atingir a referência de dias não substitui a revisão do calendário. Na semana letiva, alterações válidas entram automaticamente no calendário. Nos demais formulários, campos ainda não aplicados permanecem em memória ao trocar de seção; a navegação lateral não os salva.

Campus, ano e formas de oferta aparecem no cabeçalho do calendário, disponíveis em todas as etapas. A organização é consultada e definida individualmente em **Organização letiva por oferta**. A primeira etapa, **Semana letiva**, concentra os dias regulares. Os dias são aplicados automaticamente a cada alteração válida, sem checkbox de confirmação. O salvamento ocorre após 1,5 segundo sem novas alterações aplicadas. **Continuar para organização letiva por oferta** confere as pendências antes de avançar; não é necessário clicar para iniciar o salvamento. Valores incompletos ou incompatíveis com os períodos permanecem no formulário, com aviso, e não substituem o último estado válido do calendário. Alterar os dias atualiza a contagem; as datas das etapas de avaliação são preservadas. Períodos antigos com meta de dias podem ter seu término recalculado, com validação dos limites das etapas antes de gravar. A contagem de dias acompanha todas as etapas; as pendências, a exportação e **Concluir e tornar definitivo** ficam na etapa **Revisão e conclusão**. A conversão mantém os dados editáveis e não representa aprovação institucional. O menu **Mais ações**, no topo, reúne o histórico de alterações, a importação e o download de cópias, com descrições das opções.

Cada seção do editor usa um endereço sob `/calendarios/<id>/`, terminando em `editar`, `periodos`, `avaliacoes`, `dias`, `ferias`, `eventos`, `pendencias` ou `visualizar`. O endereço antigo `avaliacoes` abre o bloco de avaliações dentro de `periodos`. Endereços antigos terminados em `historico` continuam válidos e levam à etapa **Atividades e datas do campus**.

Na lista de calendários, **Editar** abre a edição. **Criado por** identifica a autoria original e **Última alteração por** identifica quem alterou a versão atual, junto da data e hora. A atribuição vem do histórico de operações do próprio calendário; uploads, pareceres e operações de lixeira não substituem a autoria da última alteração de conteúdo. Quando a evidência não existe para a criação ou para a versão atual, aparece **Autoria não registrada**.

## Atualização do portal

O portal verifica se há uma nova versão publicada. O aviso **Uma nova versão do portal está disponível** permite atualizar quando não há trabalho pendente. Uma aba limpa também pode atualizar ao clicar em outra seção do menu principal. Trocas de etapa do calendário e a saída do editor seguem seu fluxo habitual; salvar e sair não autoriza uma atualização no mesmo clique.

O login pelo Google está intencionalmente desabilitado até segundo aviso. Use o acesso por e-mail e senha descrito em [Acesso e contas](recuperacao-de-senha.md). Se a integração for reativada futuramente, a troca para Google deverá preservar a proteção dos campos locais ainda preenchidos.

Com campos em preenchimento, pareceres não salvos, arquivos selecionados, operações em andamento ou recuperação de acesso, a aba permanece aberta. Use **Voltar ao preenchimento pendente** ou o menu para retornar ao fluxo e aplicar, salvar ou descartar explicitamente seus dados. O botão **Atualizar agora** não envia nem descarta formulários. Filtros de consulta não impedem a atualização. Ativação e recuperação de senha precisam ser concluídas antes de trocar a página.

Se uma tentativa carregar novamente a versão anterior, o aviso orienta uma nova tentativa manual e suspende as trocas automáticas nessa página. **Reabrir calendário atualizado**, quando há dados remotos mais recentes, adota esses dados na sessão atual após a confirmação de descarte dos campos locais; os demais preenchimentos do portal permanecem protegidos.

Durante **Atualizando portal…**, os controles ficam temporariamente bloqueados. Se o carregamento demorar dez segundos, **Cancelar atualização** interrompe a navegação e permite continuar nesta aba. Uma nova tentativa exige outro gesto e nova verificação. Se a navegação falhar e o aviso continuar, use esse cancelamento antes de voltar a editar.

Se uma tela não carregar seus arquivos, **Tentar novamente** usa o mesmo endereço dos arquivos. O editor e os preenchimentos das outras telas permanecem na mesma sessão. Alguns erros de módulo ficam memorizados pelo navegador: se a tentativa não resolver, volte ao trabalho pendente, conclua-o e use a atualização protegida. Manter a página aberta preserva os dados em memória; encerrar o processo, descartar a aba ou perder energia ainda pode perdê-los. Abas abertas antes da primeira publicação deste mecanismo precisam de um primeiro acesso ou recarregamento para recebê-lo.

## Perfis e criação

ADMIN acessa todos os campi, gerencia contas e base institucional e registra a revisão técnico-pedagógica. CAMPUS consulta a base e cria, altera, exporta, exclui e restaura calendários da unidade autorizada. PARECERISTA consulta os calendários de todos os campi e as referências publicadas, registra revisões e emite pareceres, sem alterar calendários, base institucional ou contas. A autorização é conferida no backend.

No painel de revisão, **Abrir calendário em outra aba** permite ao PARECERISTA consultar o calendário anual, os dados, eventos e pendências em modo somente leitura. A navegação, a impressão e a exportação permanecem disponíveis; os controles de edição e o salvamento ficam desativados. Alterações recebidas do campus atualizam a consulta automaticamente.

Em **Contas e acessos**, o ADMIN pode escolher o perfil ao lado de cada conta e clicar em **Salvar perfil**. CAMPUS exige uma unidade ativa; ADMIN e PARECERISTA têm escopo institucional. A troca preserva a senha, fica registrada nos logs e encerra as sessões do usuário, que deverá entrar novamente. O sistema impede retirar o perfil do último administrador ativo. O perfil muda somente por uma alteração explícita.

Em **Calendários → Novo calendário**, informe campus, ano, uma lista de ofertas, cursos e, opcionalmente, turmas e turnos. Cada oferta recebe um tipo, organização anual ou semestral e nome opcional; ao repetir um tipo, os nomes são obrigatórios e distintos. O nome é preenchido a partir de campus e ano. Um calendário pode combinar até doze ofertas de Técnico integrado, Técnico subsequente, Graduação e Pós-graduação. Pode haver várias graduações, por exemplo uma anual e duas semestrais, com períodos e etapas independentes.

Teste e definitivo são finalidades do calendário, não estados de aprovação. Um teste pode ser convertido em definitivo preservando os dados e o histórico e continua editável.

## Construção e contagem

Configure a semana letiva e registre os períodos e eventos locais. Cada evento possui categoria/cor, ofertas abrangidas e efeito: incluir dias, excluir dias ou somente registrar. A cor não determina se ele entra na contagem.

O cálculo usa datas civis, intervalos inclusivos e o escopo de cada oferta. Dias não são contados duas vezes. Uma exclusão prevalece sobre uma inclusão na mesma data e gera conflito para conferência. Em **Sábados letivos**, um calendário anual mostra os doze meses com a coluna de sábado destacada, os sábados já registrados, os impedimentos que tornam uma data não letiva e os sábados fora dos períodos letivos, que não podem ser selecionados. Marque um ou mais sábados, de qualquer mês, e informe no painel ao lado uma atividade que vale para toda a seleção; as atividades já registradas aparecem como sugestão. Use **Adicionar** para confirmar a inclusão; para dar informações diferentes a datas diferentes, adicione-as em lotes separados. Clique em um sábado registrado para editar a atividade ou removê-lo na própria etapa; inclusões de vários dias continuam sendo editadas em **Atividades e datas do campus**. O topo do painel mostra a contagem de dias letivos de cada oferta e quanto ela passa a ser com a seleção. Em telas estreitas, uma barra fixa abre o painel em uma janela sobre o calendário. Fechar pelo **X** ou por **Esc** conserva a seleção e os campos em memória nesta sessão. Ao editar um sábado registrado, reabra a mesma data para continuar o preenchimento. **Descartar alterações** limpa o preenchimento pendente; **Remover sábado** exclui o registro aplicado. A seleção fica em preenchimento até a confirmação; sábados não são incluídos automaticamente para completar metas.

As metas automáticas de 200 dias anuais e 100 por período semestral estão configuradas para 2027, exceto Pós-graduação. Outros anos e ofertas sem meta não recebem conformidade presumida. Os totais por oferta, período e dia da semana ajudam na conferência; não comprovam carga horária curricular nem atendimento integral à norma.

Informe até três períodos de férias docentes, com datas. A prévia mostra o total de dias corridos; não há imposição de janeiro ou julho no formulário. Férias excluem os dias correspondentes da contagem.

Em **Organização letiva por oferta**, configure cada oferta em um bloco: primeiro a organização anual ou semestral e as datas dos períodos, depois escolha **Etapas**: duas, três ou quatro no ano letivo para organização anual; uma ou duas por semestre para organização semestral. Os semestres mostram seus próprios grupos, cada qual começando na 1ª etapa. Cada etapa tem início e término preenchidos manualmente; não há sugestão nem redistribuição automática de datas. Ofertas diferentes podem ter datas coincidentes, mas seus períodos e etapas são independentes.

O resumo de cada oferta indica as etapas sem datas e as alterações ainda não aplicadas, inclusive após **Recolher**. O botão usa uma seta para cima para identificar a ação de recolher. **Continuar para sábados letivos** confere as ofertas incluídas e os preenchimentos iniciados: se houver pendências, abre a oferta e leva ao campo a corrigir. Aplique a organização completa ou cancele a edição antes de avançar. Ofertas ainda não incluídas e sem preenchimento não impedem o avanço.

A lista mostra as ofertas do calendário. **Adicionar oferta** abre um novo formulário, inclusive de tipo já existente; ela só passa a fazer parte do calendário quando seus períodos e etapas são aplicados juntos. **Configurar** ou **Editar organização** abre uma oferta já incluída. A inclusão conserva os dados existentes e o histórico; eventos antigos sem oferta explícita mantêm o escopo anterior. Os campos permanecem em preenchimento até **Aplicar organização de…**, que aplica os períodos e todas as etapas juntos. Só a confirmação do indicador de salvamento representa gravação concluída. **Recolher** conserva o preenchimento nesta sessão, inclusive ao navegar; **Cancelar edição** descarta apenas as alterações daquela oferta e retorna ao resumo aplicado.

O tipo de uma oferta já salva não muda, e sua remoção não está disponível. Nome, modo e base da organização são editáveis; modo e base não alteram as exigências normativas.

A tela avisa imediatamente quando uma etapa fica fora do período do seu ciclo, atravessa o intervalo entre os semestres ou se sobrepõe à etapa anterior. Inclusões letivas que ficariam sem período também são identificadas antes de aplicar. O Convex verifica novamente os limites antes de gravar. Corrija o conjunto; não é preciso excluir uma oferta de um período compartilhado e deixá-la temporariamente sem período.

Períodos compartilhados anteriores são separados ao aplicar a organização de uma oferta, preservando as datas e os vínculos das outras. Períodos legados sem associação ficam identificados para classificação explícita. As etapas são definidas por suas datas e não exigem fonte ou referência. Reduzir a quantidade de etapas conserva os registros excedentes como eventos sem vínculo de avaliação.

**Norma aplicável ao calendário** fica em **Revisão e conclusão**. Confirme a aplicação da Resolução 292 ao escopo do calendário. Calendários sujeitos a norma própria continuam sem conclusão automática pelas regras da Resolução 292.

Em **Atividades e datas do campus**, abra **Matrícula de ingressantes** e, quando necessário, **Exigência por regra local**. **Exigir esta atividade no calendário** vale somente para a oferta e o ciclo selecionados. Sem configuração não há exigência automática nem declaração de ausência de ingresso. Exigências anteriores continuam valendo; as regras de veteranos permanecem independentes.

## Etapas de avaliação

A definição dos períodos e das etapas ocorre no mesmo formulário da oferta, em **Organização letiva por oferta**. Edições abertas pelo calendário ou por links da revisão retornam a esse bloco. Alterar feriados, sábados ou a semana letiva atualiza a contagem de dias, sem substituir as datas preenchidas para as etapas.

## Salvamento, cópias e conflitos

Na **Semana letiva**, alterações válidas são aplicadas automaticamente, e o salvamento aguarda 1,5 segundo sem novas alterações aplicadas. Nos demais formulários, **Adicionar/Aplicar** inclui o preenchimento no calendário e inicia o salvamento. O rodapé da etapa distingue gravação pendente, em andamento, confirmada e falha. A confirmação **Alterações salvas** aparece somente após a resposta do servidor. Falhas, conflitos e campos ainda em edição recebem aviso na área superior, que permanece visível durante a rolagem. Campos ainda em edição não fazem parte do estado salvo até serem aplicados.

Em falha recuperável, use **Tentar novamente**. Conflito de versões ou sessão expirada preserva as alterações na tela; siga a orientação para guardar uma cópia e conferir a versão atual antes de continuar. Atualizações recebidas de outra sessão não substituem campos não aplicados. Durante falta de conexão, mantenha a página aberta até a confirmação; não existe armazenamento offline durável.

**Sair**, no cabeçalho, pede confirmação quando há alterações no editor e aguarda o salvamento das alterações aplicadas antes de encerrar a conta. A confirmação informa quando campos ainda não aplicados serão descartados; **Cancelar** mantém o preenchimento.

Se o acesso expirar, o editor pausa o preenchimento e apresenta somente **Entrar novamente** para retomar com a mesma conta. Durante a verificação do acesso, aguarde. Em manutenção, o aviso **Portal em manutenção** orienta manter a aba aberta e aguardar, sem botões. Após a liberação, a edição é retomada ou o portal solicita novo acesso. Alterações e campos em preenchimento permanecem nesta aba; trocar de conta, perfil ou campus limpa os dados locais da identidade anterior. Recarregar ou fechar a aba não preserva esses dados.

**Baixar cópia** gera JSON do estado aplicado, não dos campos ainda em edição. **Importar cópia** abre um JSON compatível e substitui o rascunho da sessão após confirmação. A importação também precisa ter seu salvamento confirmado.

As novas cópias usam o formato 4. Cópias dos formatos 2 ou 3 são recusadas com uma mensagem explicativa. A cópia deve conservar o ano, campus e a identidade/tipo de todas as ofertas já salvas; não permite removê-las ou trocar seu tipo. Um cliente antigo não pode sobrescrever conteúdo v4: atualize a aplicação e conserve o preenchimento antes de retomar.

## Base institucional e documentos

**Regras do calendário** mostra, para todos os perfis, as regras que o editor usa para indicar pendências e que a revisão confere: norma, conjunto de regras vigente, janela do ano letivo, cada atividade com sua base normativa e a aplicação por oferta (obrigatória, opcional, conforme ingresso ou norma própria), mínimos de dias letivos, histórico das versões e critérios da revisão. As regras valem para ofertas anuais, semestrais ou mistas, com duas, três ou quatro etapas anuais, ou uma ou duas por semestre: a organização do calendário muda apenas quantas vezes cada atividade se repete, não a obrigatoriedade por oferta.

Em **Documentos e normas** e **Feriados e eventos institucionais**, CAMPUS consulta a base disponibilizada e ADMIN também acessa as ações de manutenção. Em Documentos e normas, ambos podem filtrar por ano; ADMIN pode filtrar por situação (rascunho, vigente ou arquivado). Esses filtros são aplicados antes da paginação. As mesmas telas atendem os dois perfis. Eventos indicam datas, categoria, efeito, ofertas e fonte. Mudanças na revisão institucional exigem conferir o impacto e confirmar a atualização no calendário; uma análise humana anterior pode ficar desatualizada.

Na lista, cada documento destaca título, situação, ano, tipo, versão e origem. **Visualizar PDF** abre o leitor na própria aplicação, com paginação, ampliação e texto extraído da página quando disponível. **Voltar à lista** ou Escape fecha a leitura e preserva os filtros. O leitor também permite abrir o original em outra aba e baixar uma cópia como ação secundária. **Detalhes** reúne nome do arquivo, tamanho e data de envio. Um original aguardando restauração é sinalizado e não pode ser aberto até sua recuperação.

Documentos aceitam PDF de até 8 MB, com título, ano, tipo e fundamento de aplicação. O envio cria um rascunho. ADMIN encontra as ações em **Gerenciar**: após visualizar e conferir arquivo, ano e aplicabilidade, marque a conferência e use **Definir como vigente**. Há uma versão vigente por tipo e ano; a anterior é arquivada e preservada. **Retirar de vigência** exige confirmação e preserva o documento no histórico. A restauração de originais indisponíveis também fica em **Gerenciar**.

Enviar um documento não atualiza automaticamente datas, regras de cálculo ou critérios de revisão. Eventos são mantidos no catálogo; mudanças no motor exigem implementação e verificação.

## Atividades, editais e referências

A etapa 5 tem duas abas: **Atividades/Eventos da Resolução** e **Atividades/Eventos do Campus**. O envio e a extração de calendários anteriores foram retirados. Registros já gravados conservam sua procedência e podem ser editados normalmente. A aba escolhida, a busca, a situação, a oferta e o assunto ficam na URL; valores inválidos voltam ao padrão.

**Atividades/Eventos da Resolução** mostra o progresso por oferta e uma linha por atividade, agrupada em **Ingresso e vida acadêmica**, **Registros e prazos docentes**, **Atividades e semanas do campus** e **Outros eventos e impedimentos**. Por padrão, a lista exibe só o que está **a preencher** (pendente, parcial ou com aplicação a confirmar); **Mostrar todas** ou o filtro **Situação** exibem as completas e opcionais. Oferta e assunto ficam em **Mais filtros**.

Todos os formulários abrem no mesmo **painel lateral**, que mantém a lista visível e fecha com o botão ✕ ou a tecla Esc. Clicar numa atividade sem registros abre direto o preenchimento; com registros, o painel mostra a situação, o fundamento, os registros (com **Editar** e **Remover**) e **Adicionar outro período**. **Situação por oferta e conferência** detalha aplicabilidade, cobertura e conferência humana; o detalhe abre sozinho quando as ofertas divergem, há problema ou a atividade foi aberta por um link da revisão. Descrição, categoria e efeito vêm preenchidos em **Mais opções**. **Alterar vínculo** escolhe outra atividade ou deixa o registro sem vínculo; etapas de avaliação são editadas na etapa 2, junto dos períodos da oferta. Na edição, os valores gravados são preservados. Um evento só atende as ofertas explicitamente abrangidas.

**Atividades/Eventos do Campus** reúne feriados, recessos, reposições, eventos e prazos sem atividade correspondente, além do Dia do Professor. A listagem usa as mesmas linhas compactas das atividades da Resolução: descrição, situação, datas e seta. Clique em uma linha para consultar os detalhes e as ações **Editar evento** e **Remover** no painel lateral. O Dia do Professor abre seu ajuste de data no mesmo painel, com o intervalo permitido abaixo do campo. Fechar conserva a data ainda não aplicada; **Descartar alterações** abandona esse preenchimento. **Restaurar data institucional** continua aplicando a data da base ao calendário. Pessoas com acesso somente de leitura também podem abrir os detalhes; as ações de alteração ficam desabilitadas. **Adicionar novo evento** pergunta **O que é este evento?**; a resposta define o efeito na contagem e a categoria, ajustáveis em **Mais opções**. Para registrar um fato anterior sem PDF, conserve as datas reais em um evento informativo. A lista consolidada de registros institucionais e locais fica em **Visualizar calendário**; registros locais podem ser abertos para edição conforme a permissão da pessoa.

Para um edital, informe tipo, situação de publicação e destino do ingresso separadamente das datas. **Publicação prevista** pode completar o planejamento após conferência; não comprova execução. **Publicação realizada** conserva a data real. A passagem do tempo não transforma previsão em realização. Referências anteriores são informativas, sem efeito em dias letivos, horas, férias ou etapas atuais.

Exemplos: um edital publicado em dezembro de 2026 para ingresso em 2027 conserva a data de 2026. Uma publicação em dezembro de 2027 para ingresso em 2028 conserva dezembro; no processo seletivo regular, o prazo de referência é 15/06/2027, e o ajuste exige conferência. O prazo institucional não é prova de publicação realizada. Intervalos informativos que atravessam a virada conservam as duas datas.

Um feriado municipal ou recesso decorrente pode identificar expressamente a causa. Para prazos do calendário de referência abrangidos pelo art. 3º, § 2º, a política consulta o primeiro dia letivo subsequente por oferta, sem alterar a data cadastrada do fato. Uma exclusão genérica não comprova essa causa; a extensão não é aplicada automaticamente aos prazos do art. 11.

O painel mantém um formulário ativo. **X** e **Esc** fecham o painel e conservam o rascunho em memória, retomável por **Continuar preenchimento**. **Descartar alterações** aparece quando há campos alterados e limpa somente o preenchimento pendente, sem remover um registro já aplicado. Se a sessão expirar com o painel aberto, ele se fecha e o rascunho é conservado. Aplicar altera o calendário local, e somente a confirmação do servidor comprova a gravação. Filtros de consulta não alteram as ofertas preenchidas.

## Revisão e saídas

Em **Revisões e pareceres**, ADMIN abre a análise, confere as indicações e confirma os critérios. A busca por nome/categoria apenas localiza candidatos; não comprova atendimento ou ausência documental. As situações humanas são Pendente, Atendido, Não atendido e Não aplicável. A conclusão é um texto proposto que o parecerista pode editar.

O roteiro de 2027 usa a Resolução CONSUP/IFPR nº 292, de 5 de outubro de 2026, SEI 4422750, com política compartilhada entre editor, revisão, backend e documentos. Pós-graduação depende de norma própria; o modelo ainda não identifica EaD e qualificação separadamente. Não se presume conformidade nesses escopos. A primeira/segunda semana das atividades tem mês validado e conferência humana, pois a resolução não define seu intervalo operacional.

Uma revisão que não avaliou o conjunto vigente de regras de 2027 fica desatualizada mesmo sem alteração das datas ou do número da base. Revisões e snapshots anteriores permanecem preservados.

**Salvar análise** é explícito e registra autoria e versões. Alterações posteriores no calendário ou na base tornam a revisão desatualizada e exigem reavaliação. A exportação do parecer requer revisão salva e atual e oferece prévia, HTML, texto e cópia para a área de transferência. Confira a formatação ao colar no SEI; assinatura e tramitação ocorrem fora da aplicação.

Em **Visualizar calendário**, **Imprimir ou salvar PDF** abre a impressão do navegador; escolha _Salvar como PDF_ como destino e desative cabeçalhos e rodapés. O calendário de teste é identificado como tal. Um calendário definitivo com pendências sai como **cópia da proposta para análise**, sem aprovação. A saída definitiva depende de contagem válida, ausência de conflitos, base atual, roteiro completo e revisão humana atualizada com os critérios atendidos ou não aplicáveis confirmados. Os impedimentos e alertas vêm das verificações implementadas; não constituem aprovação institucional.

A impressão conserva a grade do ano do calendário. **Atividades e referências de outros anos** apresenta datas integrais e finalidade, separando previsões de fatos anteriores. Um intervalo que cruza o ano também mostra suas datas integrais na parte correspondente da grade. A finalidade de ingresso futuro aparece junto da publicação, sem mudar sua data.

As etapas de preenchimento não solicitam fontes manuais. As referências automáticas dos eventos institucionais e das normas continuam disponíveis. A retirada dos campos não muda datas, contagens ou prazos.

## Lixeira e histórico

**Excluir calendário** move o registro para a lixeira após confirmação. Ele sai das listas de trabalho e revisão; dados, versões e documentos são preservados. A exclusão exige a versão atual. Acesse o link **Lixeira** na linha do filtro de campus, acima da lista de calendários para consultar os excluídos em uma visualização própria. **Voltar aos calendários** retorna à lista de trabalho. **Restaurar calendário** devolve o registro ao trabalho, dentro do mesmo escopo de acesso. Não há descarte físico automático.

**Histórico de alterações** consulta operações salvas com autoria e contexto autorizado. Campos em edição que ainda não foram gravados não aparecem no histórico.

## Usuários online

A aba **Usuários online**, exclusiva do ADMIN, mostra nome, e-mail, campus e perfil das pessoas conectadas. A lista e os totais de pessoas e campi se atualizam automaticamente; a busca por nome/e-mail e o filtro por campus restringem a lista.

A presença é acompanhada no portal e no editor de calendários. Cada pessoa conta uma vez, mesmo com várias abas ou dispositivos. Fechar a última aba ou sair da conta encerra a presença; em perda abrupta de conexão, a remoção ocorre após cerca de 90 segundos sem confirmação. **Última presença: Agora** indica conexão recente, não interação contínua com o sistema. Uma sessão de login válida, sozinha, não torna a pessoa online.

## Formulários e manutenção

Erros de campo aparecem junto ao preenchimento; erros de operação preservam os valores para correção ou nova tentativa. Um campo válido não comprova salvamento. Arquivos selecionados não são preservados quando o fluxo é desmontado; selecione-os novamente ao retornar.

Durante manutenção, novas alterações e processamento ficam indisponíveis no backend. Mantenha a aba aberta e aguarde a liberação. No editor, não feche nem atualize a página enquanto houver alterações sem confirmação de salvamento ou campos em preenchimento. Para usar uma versão nova do portal, siga o aviso de atualização após resolver as pendências. Não repita envios enquanto o resultado anterior estiver incerto; confira o estado do registro após a retomada.
