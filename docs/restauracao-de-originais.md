# Restauração dos PDFs originais

Os registros marcados como original indisponível mantêm sua identidade, metadados, análises e referências usadas nos calendários. Quando o arquivo chegar, um ADMIN deve usar **Restaurar original** no histórico do calendário ou na lista de documentos institucionais.

Selecione o PDF original, com até 8 MB. O envio passa pela mesma validação de tamanho e assinatura PDF dos demais uploads; o servidor calcula o SHA-256. A restauração só é aceita se esse hash for exatamente o já registrado no documento. Um PDF diferente, inclusive uma nova digitalização ou uma cópia reexportada, não substitui o original automaticamente. Confira a origem do arquivo se houver divergência.

A operação usa o registro existente. Seu ID, nome de arquivo cadastrado, notas, datas, análises e vínculos históricos são preservados. Somente o `storageId` passa a apontar para os bytes recebidos, e a indicação de indisponibilidade é removida. O nome escolhido no upload não renomeia o registro. Não cadastre outro documento ou outro calendário anterior para contornar uma divergência de hash.

Uploads pertencem à conta que os iniciou e só podem ser consumidos uma vez. A restauração exige ADMIN e confere essas condições novamente na transação. Uma falha não consome o upload nem altera o registro; envios temporários abandonados expiram. Depois da confirmação, confira o download do original. A análise já guardada continua vinculada ao mesmo PDF histórico.

Para operação administrativa, as funções são `nativeActions.restoreHistoryOriginal` e `nativeActions.restoreDocumentOriginal`, com `{ id, uploadId }`; o `uploadId` deve vir do fluxo autenticado de envio e conclusão. Elas possuem as mesmas verificações usadas pela interface.

Depois de uma manutenção prolongada, execute uma vez a função interna `nativeFiles.cleanupExpired` pelo destino explicitamente conferido. Ela remove lotes limitados de tickets vencidos, PDFs temporários de geração e uploads não consumidos, continuando automaticamente quando necessário. Arquivos já associados a registros por um upload consumido são preservados. Essa limpeza não recupera originais ausentes.
