# Históricos de calendário em tabela separada

Esta alteração não exclui calendários nem versões iguais. Cada posição original
continua existindo em `dentec_private.calendar_versions`, com o JSON completo,
o identificador do calendário e a posição original. Não há deduplicação automática.

## Aplicação

Ao iniciar a versão atualizada, uma transação bloqueia a linha canônica, mantém
uma cópia original em `dentec_private.history_migration_backups`, copia os
históricos e compara cada conteúdo antes de substituir os históricos embutidos
por metadados. Qualquer divergência interrompe e desfaz a transação. As novas
tabelas têm RLS e acesso PUBLIC revogado, dentro do esquema privado existente.

Os salvamentos seguintes arquivam os novos snapshots na mesma transação da
edição. A posição faz parte da chave: duas versões iguais nunca se sobrepõem.
Snapshots escritos por uma instância da versão anterior durante a transição
também são copiados na próxima inicialização ou edição de calendário.

Leituras normais continuam projetadas por usuário/campus/calendário. A opção
interna `store.read({full:true})` recompõe o documento completo a partir das
tabelas; ela não é exposta como uma nova rota pública.

O salvamento compara o estado normalizado, a revisão institucional e os
documentos/eventos institucionais. Quando nenhum desses elementos muda,
preserva versão, horário e histórico, sem adicionar um evento SAVE_CALENDAR.
Conflitos de versão e permissões continuam sendo verificados antes disso.

## Verificação e reversão

Antes de publicar, testar migração, reinicialização, versões iguais, campos
desconhecidos, PDFs anteriores, rollback de conflito, edição e reabertura por
campi distintos. Depois de publicar, conferir a contagem de snapshots e a
equivalência entre o backup inicial e as posições arquivadas que ele contém.
Novos snapshots podem ter sido acrescentados após o backup.

Para voltar ao formato embutido, recompor **o estado atual** com os snapshots
arquivados sob a mesma transação e bloqueio usados na migração. O SQL de
recomposição está em `completeCalendarsSql`, em `src/postgres-history.mjs`.
Não restaurar cegamente o backup inicial: isso descartaria edições posteriores.
Manter tabelas e backup até validação e autorização expressa para limpeza.

A restrição de egress já contabilizado pelo Supabase não é removida por esta
migração. A redução de transferência deve ser medida após a liberação do serviço.
