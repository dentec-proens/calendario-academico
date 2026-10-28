# Code review da implementação de segurança

Revisão posterior à implementação por subagente do [plano incorporado](analise-seguranca-2026-10-28.md#plano-incorporado-para-implementação), comparando as mudanças de trabalho com `9a33d8b44289acf44dc6383d69f328d50298a502`. Arquivos novos e patches versionados também foram examinados. As alterações externas de autoria/licença e do README foram preservadas e não fazem parte da avaliação de segurança.

O responsável principal conferiu as fronteiras de autenticação, admissão, arquivos e patches. Dois revisores independentes examinaram padrões e requisitos em paralelo. Foram encontrados três pontos acionáveis na primeira versão; as correções voltaram ao implementador e foram revistas novamente. A conferência estática após as correções não identificou outro achado acionável nos caminhos examinados.

## Standards

**Achado inicial P2 corrigido: pré-admissão de autenticação recente em query.** `access/session.assertAdmin` era uma `internalQuery` que passou a depender da janela de quinze minutos de `requireRecentAdmin`. O cache poderia manter uma pré-validação antiga e permitir calcular o hash antes da rejeição na mutation final. Não havia bypass comprovado da gravação.

A pré-admissão agora é uma `internalMutation` sem escrita, chamada antes da abertura do lease. O helper de recência aceita contexto de mutation. A regressão exerce uma criação válida, avança além da janela e exige rejeição antes do hash e da alocação de lease. Isso atende à regra de queries independentes do relógio em `convex/_generated/ai/guidelines.md`.

Patches reproduzíveis, validadores, limites dos lotes, campos opcionais para compatibilidade e testes genéricos de rollback do simulador foram conferidos. A revisão final deste eixo não encontrou outro achado acionável; não há pendências locais de Standards identificadas nesta rodada.

## Spec

**Achado inicial P1 corrigido: login com senha antiga concorrendo com recuperação.** Na primeira versão, verificar a senha e criar a sessão eram transações separadas. Um reset entre elas avançava a geração; a criação posterior carimbava a geração nova numa sessão autorizada pela senha antiga. Isso contrariava a invalidação imediata exigida em S01.

`access/passwordSignIn.authorize` agora compõe a verificação upstream da credencial e a criação da sessão, sem tokens, na mesma transação externa. Falhas de credencial retornam como dados para preservar a contabilização upstream de tentativas; a action transforma o resultado em erro depois do commit. A emissão posterior usa a sessão criada e confere sua geração, recusando um reset que tenha ocorrido após a autorização atômica. O provider mantém o ID `password`, o armazenamento e o limitador existentes; OAuth permanece separado.

A regressão pausa na fronteira real entre action e mutation, depois do commit, intercala uma recuperação pública e verifica que a autorização antiga não emite tokens válidos. O implementador reintroduziu temporariamente o fluxo anterior e confirmou a falha; restaurada a composição atômica, o teste passou. A pausa não prende a verificação dentro de uma mutation nem usa um relógio artificial para evitar a corrida.

**Achado inicial P2 corrigido: frequência não limitava trabalho pendente.** O token bucket de S02 limitava operações por minuto, mas sua reposição permitiria admitir uma terceira operação enquanto duas anteriores continuassem pendentes.

A admissão agora verifica no máximo duas leases por chave derivada do hash da capacidade válida e reserva o lease na mesma transação da quota. As actions usam o lease já admitido e liberam-no no `finally`. Senhas e tokens em claro não são persistidos nesse controle. Falha de liberação conserva a sinalização; a idade do lease não comprova conclusão.

A regressão segura dois hashes, avança 61 segundos para repor o bucket e exige rejeição do terceiro sem executar outro hash. Ao retirar somente o gate de slots, o teste falhou; restaurado o gate, passou.

O revisor de requisitos não identificou outras lacunas acionáveis ou ampliação indevida dos oito itens na leitura final. As dependências de ensaio remoto e a migração de v1 por redefinição estão explicitadas no [guia operacional](seguranca-operacional.md).

## Conferências do responsável principal

- A geração é carimbada na criação transacional da sessão, incluindo rollback do callback. Não se usa `_creationTime` como ordem de commit, e um refresh não atualiza a recência original.
- Remoção, troca de papel/campus e recuperação invalidam a geração antes da limpeza. Os lotes usam usuário/geração e preservam sessões atuais. A exceção operacional de manutenção e smoke continua explícita.
- Tokens inválidos são recusados antes do trabalho caro, da quota e do lease. A admissão confirma quota separadamente do consumo final e limita operações em andamento.
- O ingresso autenticado de arquivos recebe bytes, valida proprietário/tamanho/assinatura e cria objeto/vínculo transacionalmente. O caminho antigo por `storageId` é recusado. Objetos legados sem prova de ingresso não são apagados cegamente.
- O patch Auth adiciona somente o callback transacional e a proteção do par de refresh incompatível, com código distribuído, fonte e tipos. Replay e renovação válidos têm regressões próprias.
- O patch do simulador implementa syscalls genéricos do SDK 1.48. Seus testes cobrem bytes, metadados, digest, exclusão e rollback de transações externas e aninhadas. Ele não certifica limites do serviço remoto.
- Hash v2 aceita somente parâmetros conhecidos e limitados em memória, preservando v1. A atualização é feita na criação/ativação e redefinição; não foi declarado rehash automático no login.
- O desbloqueio exige autorização e recência, produz auditoria e possui contingência interna estreita. A UI possui cobertura de teclado e controles desobstruídos em desktop/mobile.
- A proteção de release que recusa expansão online de auth, componentes e dependências foi preservada. Nenhum deploy foi realizado.

## Validação e limites

`pnpm check` sobre a versão corrigida terminou com código 0 em 179,30 segundos na repetição completa: formatação de código/configuração, lint comum e com tipos, quatro projetos TypeScript, verificação das skills, 79 arquivos com 467 testes unitários, 228 testes de navegador e build aprovados. O navegador levou aproximadamente 2,7 minutos, incluindo desktop/mobile, teclado, controles desobstruídos e comparações visuais. O build emitiu avisos sobre diretivas `use client` de dependências, sem impedir sua conclusão. Não houve mudança de código entre a execução com a falha visual descrita abaixo e a repetição aprovada. Os resultados da primeira implementação, anterior às correções de review, não são usados para aprovar código que mudou depois.

A primeira checagem completa da versão corrigida aprovou os 467 testes unitários e 227 dos 228 testes de navegador, mas terminou com código 1 em uma comparação visual do leitor PDF no desktop: 307 pixels de diferença no contador e no botão de paginação. As imagens foram inspecionadas. O leitor, seus estilos e a referência não foram alterados nesta entrega. A repetição isolada de `pnpm test:visual test/browser/documents.visual.spec.ts --project=chromium-desktop` executou os dois projetos configurados pelo script e aprovou desktop e mobile, sem mudar código, referências, tolerâncias ou interações. A causa dessa diferença visual transitória não foi determinada; a falha inicial permanece registrada.

`pnpm audit --json` terminou com código 0 e zero avisos em todas as severidades. `git diff --check` e a conferência Prettier dos dez documentos da análise, revisão e guias alterados também passaram.

Antes de publicar, permanecem o ensaio de custo do hash no runtime real, transporte de 8 MB e o procedimento administrativo de implantação descrito no guia. O login Google está intencionalmente desabilitado até segundo aviso; seu ensaio de integração permanece necessário antes de uma futura reativação autorizada, sem exigir habilitá-lo nesta entrega. Não foram executados E2E remoto, carga, deploy ou alterações em dados reais. O runtime/modelo PDF foi preservado; não houve execução de `pnpm test:runtime:linux` para esta entrega.

**Síntese dos eixos:** Standards encontrou um P2; Spec encontrou um P1 e um P2. Os três foram tratados na implementação e reconferidos. A rodada final terminou com zero achados acionáveis pendentes em ambos os eixos e validação local aprovada na repetição completa. Isso não transforma a ocorrência visual inicial ou as pendências remotas em verificações aprovadas.
