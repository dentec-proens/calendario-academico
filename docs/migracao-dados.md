# Proveniência e preservação dos dados

O worktree de consolidação parte de `f6b8f185fd8589101df70ec513136c7674e9deb9`, antes da migração SQL, e usa o projeto Convex `calendario-academico-convex-lab`, deployment `oceanic-gazelle-652`, no team Diretoria de Ensino Técnico — PROENS. O checkout original e o ambiente institucional permanecem separados.

A importação dos dados estruturados foi concluída em 23/10/2026 a partir de uma exportação somente de leitura do Supabase Dentec `heqytxslokehuyrlxsza`. Essa referência registra a origem; o código atual não depende de acesso ao provedor anterior.

| Conjunto original                  | Quantidade |
| ---------------------------------- | ---------: |
| Perfis                             |         33 |
| Campi                              |         29 |
| Calendários                        |         60 |
| Versões e snapshots de calendários |        699 |
| Históricos e referências de PDF    |         13 |
| Pareceres                          |          3 |
| Versões de parecer                 |         12 |
| Auditorias na exportação de origem |        918 |

Os IDs de domínio, os vínculos, as versões completas e suas posições foram preservados. Credenciais locais compatíveis foram vinculadas ao Convex Auth; sessões do backend anterior não se tornaram sessões autenticadas do Convex. A ativação autorizada da conta de administração e as fixtures posteriores estão identificadas nos relatórios de teste.

Os **13 PDFs originais não foram transferidos**, por decisão do usuário diante da quota de saída da origem. Seus metadados e referências permanecem intactos. Análises já existentes podem continuar disponíveis; isso não significa que os bytes do PDF estejam no Convex. Tentativas de consultar um arquivo pendente informam indisponibilidade sem substituir a referência por um arquivo fictício.

A consolidação removeu as ferramentas descartáveis de cópia integral e o backend antigo. O histórico Git conserva o código anterior para consulta; a futura transferência dos PDFs deve atuar somente sobre os anexos pendentes, sem repetir a importação dos dados estruturados.

Exportações completas, hashes detalhados e credenciais ficam em backups privados ignorados pelo Git. Somente relatórios sanitizados são versionados. Os ensaios usam dados sintéticos; não editam calendários importados ou o catálogo para testar publicação.

- [Importação original](evidencias-convex/native-migration.json)
- [Verificação dos fluxos ADMIN/CAMPUS](evidencias-convex/qa-portal/results.json)
- [Integridade após os ensaios](evidencias-convex/qa-portal/data-integrity.json)
- [Integridade da consolidação](evidencias-convex/consolidation-integrity.json)
