# Pendências

Extensões combinadas e ainda não implementadas, à espera de um caso real. Cada uma ganha um plano próprio em `docs/plans/` quando for implementada; os planos concluídos estão no histórico do Git.

- **Dividir uma data entre ofertas.** Hoje **Corrigir atividade vinculada** troca a atividade da data inteira, e a nova atividade precisa alcançar todas as ofertas dela. Para atender atividades ou ciclos diferentes por oferta, o campus ajusta as ofertas da data e cria outra data.
- **Destinos de ingresso distintos por oferta na interface.** O modelo já guarda um destino por oferta (`notice.admission.destinations`) e o diagnóstico é feito por oferta, mas o formulário edita um destino comum. Nenhum edital gravado tinha destinos distintos quando o modelo foi feito.
- **Versionamento das regras operacionais.** Anos sem norma configurada usam o catálogo operacional, sem histórico de versões de regras como as políticas normativas. Estender esse histórico permitiria detectar pareceres desatualizados também nesses escopos.
- **Destaque dos dias alterados na grade do calendário.** A comparação entre versões e envios lista as mudanças, mas a grade não as marca.
- **Período como parte da oferta.** Avaliar a lista plana de períodos com `offerId` e `term` no lugar de `association` contra o aninhamento na oferta. Qualquer das duas exige IDs determinísticos para conteúdo e envio, separar os períodos compartilhados e conservar `targetDays`, com novo formato de dados.
- **Férias com representação única.** `teacherVacations` guarda os intervalos e `events` as datas derivadas. Avaliar os intervalos como fonte única, com as datas derivadas na projeção.
- **Fábrica de políticas.** Nada a extrair enquanto houver uma só norma; a política de 2028 nasce com a resolução, e a extração se faz com esse segundo caso à vista.
