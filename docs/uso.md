# Regras da aplicação

Este guia registra as regras de negócio e as decisões que o código sozinho não explica. A interface (nomes de botões, posição dos controles, textos de apoio) fica no código e nos testes de navegador, não aqui.

## Perfis e acesso

- **ADMIN**: todos os campi, contas, base institucional, revisão e publicação.
- **CAMPUS**: cria, altera, exporta, exclui e restaura calendários da unidade autorizada; consulta a base. Exige uma unidade ativa.
- **PARECERISTA**: consulta calendários de todos os campi e as referências, registra revisões e pareceres; não altera calendários, base nem contas.
- A autorização é sempre conferida no backend. Quem só consulta vê os detalhes com as ações de alteração desabilitadas.
- Trocar o perfil de uma conta preserva a senha, fica registrado e encerra as sessões do usuário. Não é possível retirar o perfil do último ADMIN ativo.
- O login pelo Google está desabilitado de propósito até segundo aviso; o acesso é por e-mail e senha ([Acesso e contas](recuperacao-de-senha.md)).
- A busca de **Contas e acessos** não vai para a URL, para manter nome e e-mail fora do histórico e dos registros.

## Ciclo de vida

| Situação   | Quem edita | Regra                                                         |
| ---------- | ---------- | ------------------------------------------------------------- |
| Rascunho   | campus     | Ilimitados; um rascunho nunca enviado não tem validade.       |
| Enviado    | ninguém    | O campus pode recolher o envio.                               |
| Em revisão | ninguém    | O primeiro parecer salvo do envio move para esta situação.    |
| Devolvido  | campus     | Mostra a nota e os critérios não atendidos.                   |
| Revisado   | ninguém    | Aguarda publicação.                                           |
| Vigente    | ninguém    | Publicado pela ADMIN com processo SEI (00000.000000/0000-00). |
| Arquivado  | ninguém    | Substituído ou arquivado pela ADMIN; só consulta.             |

- **Envio bloqueado** enquanto houver qualquer pendência de conteúdo (decisão de 12/11/2026), inclusive no reenvio de um devolvido, e quando há campos não aplicados ou a base mudou desde o que a pessoa conferiu. O servidor confere sobre a base vigente, a mesma que o envio grava.
- Cada verificação declara quem a resolve (`src/domain/calendar/checks.ts`): o **campus** corrige ou declara; a **base** (base institucional ou erro do sistema) pede a administração; a **DENTEC/PROENS** julga no critério do parecer, sem impedir o envio (prazo ajustado ou prorrogado, instrução de revisão, ano letivo fora da referência); o resto só informa. Só o que o campus ou a base resolvem impede o envio; a publicação espera, além disso, todos os critérios avaliados.
- Sem mínimo de dias a verificar (ano sem norma configurada ou oferta fora da norma), a falta de mínimo é aviso, não pendência.
- Um único calendário em análise (enviado, em revisão, devolvido ou revisado) por campus, ano e tipo de oferta.
- Se já existe vigente para algum tipo de oferta, o novo calendário precisa incluir todos os tipos dele; a ADMIN pode confirmar substituição parcial.
- Publicar arquiva os vigentes que compartilham tipos de oferta.
- Vigente nunca é editado no lugar: **Nova versão** cria um rascunho com o conteúdo e a base dele, sem o parecer; o original segue vigente até a nova versão ser publicada.
- Só rascunhos e devolvidos vão para a lixeira. Excluir um devolvido o torna rascunho e libera a vaga em análise; restaurar sempre devolve um rascunho. Não há descarte físico automático.
- Identificação (cursos, turmas, turnos) e complemento do nome (até 120 caracteres) são editáveis em rascunho e devolvido e não alteram a versão do conteúdo. Campus e ano são fixos no nome.

## Ofertas e organização

- Até doze ofertas por calendário, inclusive várias do mesmo tipo com nomes distintos; períodos e etapas de cada oferta são independentes.
- O tipo de uma oferta salva não muda; nome, modo e base da organização podem mudar sem alterar as exigências normativas.
- Etapas: duas, três ou quatro no ano (anual); uma ou duas por semestre (semestral). Datas sempre manuais, sem sugestão nem redistribuição automática.
- Períodos e etapas de uma oferta são aplicados juntos. Etapas não podem sair do período do ciclo, atravessar o intervalo entre semestres nem se sobrepor; o Convex revalida antes de gravar.
- Incluir uma oferta não faz as datas existentes passarem a abrangê-la.
- Remover oferta: só em rascunho e enquanto houver outra oferta. Remove as datas e etapas exclusivas dela; datas de várias ofertas conservam as demais. Um devolvido conserva as ofertas do envio.
- Períodos compartilhados antigos são separados ao aplicar a organização de uma oferta, preservando as datas das outras.
- A referência da norma do ano (ex.: 1 fev a 17 dez, início até 15 fev em 2027) só orienta; não preenche datas.

## Contagem de dias letivos

- Datas civis, intervalos inclusivos, escopo por oferta; nenhum dia conta duas vezes.
- Cada data tem efeito: incluir dias, excluir dias ou só registrar. A cor/categoria não define o efeito.
- Exclusão prevalece sobre inclusão na mesma data e gera conflito para conferência.
- Metas automáticas em 2027: 200 dias anuais e 100 por período semestral, exceto Pós-graduação. Outros anos e ofertas sem meta não recebem conformidade presumida. Atingir a meta não comprova carga horária nem atendimento integral à norma.
- A contagem usa só o estado aplicado; campos em preenchimento não entram.
- Alterar feriados, sábados ou a semana letiva atualiza a contagem sem mexer nas datas das etapas.

## Sábados letivos

- Um sábado é selecionável quando ao menos uma oferta tem período letivo nele.
- Cada data grava só as ofertas marcadas que têm período nela, para que completar uma oferta não some dias às demais. Uma data que não alcançaria nenhuma oferta marcada impede a inclusão.
- Uma oferta que já tem outra inclusão na data fica indisponível.
- Sábados nunca são incluídos automaticamente para completar metas.

## Férias

- Os dias de férias nunca contam como letivos; efeito e categoria não são escolhidos. Datas de férias só existem no passo Férias.
- **Escolares**: sem número fixo de períodos; exige presença em cada oferta. O nome pode mudar (ex.: “Recesso escolar”) e atende ao mesmo item.
- **Docentes**: únicas para o campus, alcançam todas as ofertas, inclusive as adicionadas depois. Na norma de 2027 somam exatamente 45 dias no ano. Coincidência com as escolares é orientação; parcial é válida. Copiar os períodos das escolares não cria ligação.
- Um período fica dentro do ano do calendário: férias que continuam terminam em 31/12, e o restante vai para o calendário do ano seguinte. A impressão não apresenta 31/12 como fim nesse caso.
- Escolar e docente com as mesmas datas, nome padrão e todas as ofertas saem em uma só linha impressa; continuam sendo dois registros.

## Atividades e datas

- Uma data só atende as ofertas que lista explicitamente; uma data vinculada conta como atendimento para todas elas.
- Cada atividade conta uma pendência, mesmo que falte em várias ofertas; estrutura e dias letivos contam por item. Atividade com aplicação a confirmar é aviso, não pendência.
- Exigência por regra local (ex.: matrícula de ingressantes) vale só para a oferta e o ciclo escolhidos; sem configuração não há exigência automática.
- Atividades com carga horária somam as horas das datas, por oferta quando as ofertas diferem.
- **Vínculo a conferir**: datas cujo vínculo gravado não conta como atendimento (atividade não gerada pela organização atual, etapa duplicada, etapas fora de sequência, fora do período do ciclo).
  - O vínculo nunca é apagado nem trocado por gravação, edição ou mudança de organização. Mudanças de organização nunca são recusadas por datas gravadas; a prévia lista o que irá para **Vínculo a conferir**.
  - Etapas gravadas nunca são renumeradas: conservam a posição e voltam a contar quando a organização voltar a tê-la.
  - **Corrigir atividade vinculada** troca a atividade da data inteira por uma da organização atual que abranja todas as ofertas da data; não remove o vínculo nem divide a data. Uma etapa só vai para posição livre que caiba no período.
  - Enquanto houver datas nessa situação, o calendário não pode ser publicado; um Revisado precisa ser devolvido, corrigido e revisado de novo. Um Vigente não muda.
- **Observâncias ajustáveis** (2027): Dia do Professor de 11 a 17/10, inclusive fim de semana; Dia do Servidor em 28 ou 29/10. Escolher explicitamente uma data mantém a escolha mesmo se coincidir com a referência; restaurar faz seguir a base. Transferir o Servidor para 29/10 não remove recesso existente nessa data.
- **Data interna (art. 18)**: só para datas do campus sem efeito na contagem e nas categorias comemorativa, evento, outro evento institucional ou prazo. Fica fora do calendário oficial, não conta como atendimento, não libera publicação e é listada à parte no parecer. Efeito ou categoria incompatível desmarca a opção. Marcar não muda ID, datas, ofertas nem contagem.
- **Editais**: tipo, situação de publicação e destino do ingresso são separados das datas. O destino é por oferta e nunca é apagado ou trocado sozinho. **Publicação programada** não comprova execução; o tempo não a transforma em realizada. **Publicação realizada** conserva a data real, mesmo de outro ano.
- Referências de outros anos são informativas, sem efeito em dias letivos, horas, férias ou etapas.
- Prazos do art. 3º, § 2º: a política consulta o primeiro dia letivo subsequente por oferta quando um feriado municipal ou recesso identifica a causa, sem alterar a data cadastrada. Exclusão genérica não comprova a causa; a extensão não se aplica automaticamente aos prazos do art. 11.
- **Cópia de datas** entre calendários do mesmo campus e ano é uma fotografia: as datas copiadas viram datas comuns, sem ligação com a origem. Etapas, resultados, conselhos e reuniões por etapa não são copiados; sábados só para ofertas com período na data.

## Base institucional e normas

- O roteiro de 2027 usa a Resolução CONSUP/IFPR nº 292, de 5/10/2026 (SEI 4422750), com política compartilhada entre editor, revisão e backend. Pós-graduação e escopos com norma própria não recebem conformidade presumida.
- A primeira/segunda semana das atividades tem mês validado e conferência humana, porque a resolução não define seu intervalo.
- Calendário em edição segue a base e as regras vigentes sem confirmação; inconsistências viram pendências. Se a base mudar durante o preenchimento, o envio pede nova conferência.
- Calendário já enviado fica como foi enviado; se a base ou as regras mudarem, cabe ao parecerista devolvê-lo.
- Mudanças nas regras exigem implementação e verificação; o sistema não guarda PDFs de normas.

## Revisão e parecer

- O parecer pertence ao envio em que foi salvo; só pode ser salvo com o calendário enviado ou em revisão. Após recolhimento ou reenvio, mesmo sem alteração, precisa ser salvo de novo.
- Uma revisão que não avaliou o conjunto vigente de regras fica desatualizada mesmo sem mudança nas datas. Alterações no calendário ou na base também a desatualizam.
- **Responsável**: abrir não muda nada; assumir não inicia a revisão. Quem salva um parecer sem responsável o assume. Só o responsável salva; qualquer parecerista ou ADMIN pode assumir após confirmar. O responsável se mantém em devolução e reenvio. Concluir, devolver e reabrir não dependem de ser o responsável.
- **Concluir revisão** exige parecer deste envio salvo, atual, com todos os critérios avaliados, nenhum não atendido e base inalterada desde o envio.
- A busca de candidatos no parecer só localiza; não comprova atendimento nem ausência.
- A devolução registra os critérios não atendidos com as observações (sem autor nem revisão do parecer); se as observações não couberem, a devolução é recusada.
- Comparação: reenvio compara com o último devolvido; o primeiro envio de uma nova versão compara com o vigente que substituiria. O efeito recalculado ajuda, mas não comprova que a devolução foi atendida.
- Exportar e copiar para o SEI exigem revisão salva e atual; assinatura e tramitação ocorrem fora da aplicação.

## Impressão

- A marca depende só da situação: **Rascunho — sem validade**, **Em análise na PROENS — sem validade**, **Em ajuste — sem validade**, **Revisado — aguardando publicação**, **Processo SEI nº …**, **Arquivado** ou **Substituído por …**. Só o vigente sai sem **Sem aprovação oficial**.
- Um calendário travado é impresso sem salvar.
- Com datas internas há duas versões: **oficial** (padrão, a enviada e publicada) e **completa** (marca as datas internas, avisa que não substitui a oficial, PDF com sufixo `-completo`). A contagem é a mesma.
- Ofertas entre colchetes só quando há mais de uma oferta e a data não abrange todas; datas iguais de ofertas diferentes saem numa linha só. A legenda lista só as categorias presentes na grade.
- Cursos, turmas e turnos não aparecem na impressão.

## Salvamento e sessão

- Só a confirmação do servidor representa gravação concluída; aplicar altera apenas o estado local.
- Na Semana letiva, alterações válidas são aplicadas sozinhas e salvas após 1,5 s sem novas alterações; valores inválidos não substituem o último estado válido. Nos demais formulários, aplicar inicia o salvamento.
- Atualizações de outra sessão não substituem campos não aplicados. Conflito de versão e sessão expirada mantêm as alterações na tela.
- Não há armazenamento offline durável: recarregar ou fechar a aba perde o que não foi salvo. Trocar de conta, perfil ou campus limpa os dados locais da identidade anterior.
- **Sair** aguarda o salvamento das alterações aplicadas.
- A atualização do portal para nova versão nunca acontece com trabalho pendente (campos, pareceres, operações em andamento, recuperação de acesso); filtros não impedem.

## Histórico e registros

- Cada calendário tem seu histórico de operações; uma nova versão começa um histórico próprio. Campos não gravados não aparecem.
- **Criado por** e **Última alteração por** vêm desse histórico; pareceres e lixeira não contam como autoria de conteúdo. Sem evidência: **Autoria não registrada**.
- Falhas vistas no navegador ficam registradas por 90 dias, sem o conteúdo do calendário.
- **Usuários online** (só ADMIN): cada pessoa conta uma vez; sai ao fechar a última aba ou após cerca de 90 s sem conexão. Sessão de login válida sozinha não torna a pessoa online.
