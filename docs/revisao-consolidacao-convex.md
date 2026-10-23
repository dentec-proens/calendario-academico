# Revisão da consolidação Convex — 23/10/2026

O Claude Code CLI foi executado em modo de leitura sobre cópias sanitizadas do código, sem backups, credenciais ou dados pessoais. A primeira revisão identificou melhorias de integridade e operação; a segunda conferiu as correções e não encontrou problemas P1 ou P2.

| Achado                                                        | Tratamento                                                                                                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Possível descarte de PDF inline em backups antigos            | O plano recusa bytes inline e exige transferência prévia. A fotografia existente não contém esse formato.                                                              |
| Reposição dos originais indisponíveis                         | A administração pode restaurar o mesmo registro pela interface, com SHA-256 exato e consumo transacional do upload. IDs, metadados, análises e referências permanecem. |
| Análises antigas inacessíveis ou substituídas automaticamente | Qualquer análise existente é preservada e devolvida sem atualização implícita, inclusive depois da reposição do original.                                              |
| Etapas de avaliação antigas divididas                         | A conversão consolida somente o estado atual antes de organizar as etapas por modalidade. Snapshots históricos mantêm sua representação.                               |
| Recibo sem prova de origem do snapshot                        | `verify` exporta o próprio destino e registra os digests no checkpoint desse deployment. `finish` confere o vínculo novamente.                                         |
| Novas tabelas com dados após a fotografia inicial             | O preflight recusa qualquer tabela não vazia que não faça parte do plano.                                                                                              |
| Limpeza agendada interrompida pela manutenção                 | Uma varredura interna limitada remove temporários vencidos e continua em novos lotes. Arquivos consumidos são preservados.                                             |
| Links antigos de calendários                                  | Aliases específicos preservam as URLs emitidas antes da migração. O editor resolve o ID com autorização antes de iniciar consultas e gravações.                        |

Além das correções, o ensaio detectou IDs embutidos em decisões de ignorar sugestões históricas. Esses IDs também são traduzidos, preservando o restante da chave. As modalidades originais dos PDFs anteriores são conservadas, mesmo quando diferem das modalidades do calendário atual.

O backend final foi publicado em um Convex local com a cópia migrada e conferido pelas funções reais: calendários ativos, snapshots, pareceres, auditoria e isolamento entre campi. Outra base local, vazia e com contas sintéticas, foi usada para testar autenticação, concorrência, PDFs, pareceres, lixeira, aliases e reposição de originais pelo navegador.

A execução de produção exige uma nova fotografia depois do bloqueio das escritas, um plano calculado sobre essa fotografia e seu próprio ensaio verificado. O procedimento está em [Migração do schema](migracao-schema.md). A [restauração dos 13 PDFs originais](restauracao-de-originais.md) foi concluída em 23/10/2026 em produção e no desenvolvimento de Gustavo, com bytes e hashes verificados e preservação dos registros e das análises existentes. A pendência de transferência está encerrada nesses ambientes.
