# Restauração dos PDFs originais

## Restauração concluída em 23/10/2026

Os 13 PDFs originais foram recuperados da pasta `uploads` do bucket `dentec-private` do projeto Supabase `heqytxslokehuyrlxsza` e restaurados nos registros existentes do Convex em produção e no desenvolvimento de Gustavo.

| Ambiente        | Deployment              | PDFs restaurados | Originais ainda indisponíveis |
| --------------- | ----------------------- | ---------------- | ----------------------------- |
| Produção        | `exuberant-cheetah-138` | 13               | 0                             |
| Desenvolvimento | `oceanic-gazelle-652`   | 13               | 0                             |

As exportações finais com Storage confirmaram os bytes e o SHA-256 dos 13 PDFs em cada ambiente. Os downloads dos cinco PDFs vinculados a calendários ativos também foram conferidos em cada destino. Os demais pertencem a calendários na lixeira, cujo estado foi preservado; seus bytes foram verificados nas exportações administrativas.

A comparação com os backups anteriores confirmou a preservação dos IDs e metadados dos históricos, das análises existentes (14 em produção e 13 em desenvolvimento), dos calendários, conteúdos, versões, snapshots, documentos institucionais e pareceres. Os arquivos que já estavam no Storage permaneceram iguais. Cada ambiente recebeu 13 registros de auditoria `RESTORE_HISTORY_ORIGINAL`. A pendência de transferência desses originais está encerrada.

Os backups integrais anteriores e posteriores, os PDFs recuperados e os recibos ficam na pasta privada local `backup-pdfs-supabase-20261023/`. O recibo consolidado é `completion.json`; as verificações por ambiente são `production-verification.json` e `development-verification.json`, ambas com `result: verified`. Não versionar esses arquivos nem seus dados.

## Procedimento para novas restaurações

Se um registro estiver marcado como original indisponível, ele mantém sua identidade, metadados, análises e referências usadas nos calendários. Ao obter o arquivo, um ADMIN deve usar **Restaurar original** no histórico do calendário ou na lista de documentos institucionais.

Selecione o PDF original, com até 8 MB. O envio passa pela mesma validação de tamanho e assinatura PDF dos demais uploads; o servidor calcula o SHA-256. A restauração só é aceita se esse hash for exatamente o já registrado no documento. Um PDF diferente, inclusive uma nova digitalização ou uma cópia reexportada, não substitui o original automaticamente. Confira a origem do arquivo se houver divergência.

A operação usa o registro existente. Seu ID, nome de arquivo cadastrado, notas, datas, análises e vínculos históricos são preservados. Somente o `storageId` passa a apontar para os bytes recebidos, e a indicação de indisponibilidade é removida. O nome escolhido no upload não renomeia o registro. Não cadastre outro documento ou outro calendário anterior para contornar uma divergência de hash.

Uploads pertencem à conta que os iniciou e só podem ser consumidos uma vez. A restauração exige ADMIN e confere essas condições novamente na transação. Uma falha não consome o upload nem altera o registro; envios temporários abandonados expiram. Depois da confirmação, confira o download do original. A análise já guardada continua vinculada ao mesmo PDF histórico.

Para operação administrativa, as funções são `nativeActions.restoreHistoryOriginal` e `nativeActions.restoreDocumentOriginal`, com `{ id, uploadId }`; o `uploadId` deve vir do fluxo autenticado de envio e conclusão. Elas possuem as mesmas verificações usadas pela interface.

Depois de uma manutenção prolongada, execute uma vez a função interna `nativeFiles.cleanupExpired` pelo destino explicitamente conferido. Ela remove lotes limitados de tickets vencidos, PDFs temporários de geração e uploads não consumidos, continuando automaticamente quando necessário. Arquivos já associados a registros por um upload consumido são preservados. Essa limpeza não recupera originais ausentes.
