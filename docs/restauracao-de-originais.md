# Restauração dos PDFs originais

Um registro com original indisponível conserva identidade, metadados, análises e referências usadas nos calendários. Um ADMIN pode repor os bytes usando **Restaurar original** na lista de documentos institucionais. O fluxo de calendário anterior foi retirado da etapa de atividades; seus registros e APIs legados continuam preservados, sem formulário de restauração no editor.

## Procedimento

1. Obter o PDF original e conferir sua origem. O limite é 8 MB.
2. Selecionar **Restaurar original** no registro correto e enviar o arquivo.
3. Aguardar a confirmação do backend. Conferir em seguida o download do original.

O servidor verifica assinatura PDF, tamanho e SHA-256. A restauração exige o hash exato já registrado: nova digitalização ou cópia reexportada não substitui o original. Divergência exige conferir a origem; não criar outro registro para contornar a verificação.

A operação altera somente a referência dos bytes e a indicação de indisponibilidade. ID, nome cadastrado, notas, datas, análises e vínculos permanecem. O nome do arquivo selecionado não renomeia o documento.

## Integridade e operação

Uploads pertencem à conta que os iniciou e só podem ser consumidos uma vez. A transação repete autorização e validação. Falha não consome o upload nem altera o registro; envios abandonados expiram. Uma resposta incerta exige conferir o registro e o download antes de repetir o envio.

As actions são `actions/history:restoreHistoryOriginal` e `actions/documents:restoreDocumentOriginal`, com `{ id, uploadId }`. O `uploadId` provém do fluxo autenticado de envio e conclusão. A interface e o acesso administrativo usam as mesmas verificações.

`nativeFiles:cleanupExpired` remove temporários vencidos em lotes e continua quando necessário; arquivos já consumidos e vinculados a documentos permanecem. Essa limpeza não recupera bytes ausentes.
