# Revisão independente do subagente

Parecer solicitado em 28 de outubro de 2026 sobre o plano de correções em [Análise de segurança da aplicação](../analise-seguranca-2026-10-28.md). Baseline examinado: `9a33d8b`, Convex 1.48.0, Convex Auth 0.0.96 e Auth.js 0.41.1. O revisor leu as guidelines geradas e a skill local `convex-reviewer`; preservou código, dependências e dados remotos.

O plano está fundamentado, mas a falha de revogação S01 é mais fácil de provocar do que a prova inicial sugeria.

## Críticas ao plano

### S01 Revogação de acesso

Manter prioridade alta e acrescentar o caminho por refresh. Um login público da fixture seguido de 1.000 chamadas públicas `auth.signIn({ refreshToken })` gerou 1.001 refresh tokens numa única sessão, sem semear os tokens diretamente e sem repetir o cálculo da senha. A tentativa ADMIN de remover o membro falhou com `Limite de tokens excedido`, e o membro permaneceu ativo.

Locais: `convex/access/store.ts:66`, especialmente linha 79; biblioteca `node_modules/@convex-dev/auth/src/server/implementation/mutations/refreshSession.ts:70` e `node_modules/@convex-dev/auth/src/server/implementation/refreshTokens.ts:14`.

A correção deve invalidar imediatamente o acesso e remover registros em lotes. A limpeza não pode apagar sessões novas criadas depois da recuperação: os lotes precisam distinguir a geração antiga da nova. Também é necessário cobrir renovação de tokens; corrigir apenas `requireNativeUser` pode deixar a biblioteca emitindo tokens para uma sessão invalidada pela nova política.

### S02 Trabalho antes da validação

Antecipar a validação é necessário, mas insuficiente. Um token válido também pode ser repetido antes de seu consumo. Limitar tentativas, concorrência e trabalho total, preservando a segunda validação transacional. Um contador escrito na mesma mutation que depois lança erro pode perder a cobrança da tentativa no rollback. A camada de frontend não protege chamadas diretas ao Convex.

### S03 Uploads sem vínculo

Manter o achado e a ressalva de propriedade. Não basta apagar o `storageId` recebido no erro, porque a action ainda não demonstrou que aquele objeto pertence ao ticket. Uma limpeza geral também não pode excluir runtime Chromium, documentos legítimos ou PDFs com ticket ativo. O limite de três tickets controla emissão, não o volume recebido antes da validação.

### S04 Custo do hash

A verificação de senha é executada numa mutation do runtime Convex, em `node_modules/@convex-dev/auth/src/server/implementation/mutations/retrieveAccountWithCredentials.ts:50`. O [limite documentado do runtime Convex](https://docs.convex.dev/production/state/limits) é de 64 MiB. `N=2^17,r=8` exige aproximadamente 128 MiB apenas para scrypt e pode quebrar a autenticação.

A alternativa citada no relatório, `N=2^14,r=8,p=5`, merece ensaio de CPU e memória. Não aplicar um parâmetro mecanicamente. Versionamento e compatibilidade com v1 continuam obrigatórios. A validação local em Node não comprova que a verificação de senha caberá no runtime remoto.

### S05 Avisos de dependência

Manter como atualização de manutenção, sem elevar a exploração presumida. As condições dos três avisos não bastam para afirmar exploração no portal. Atualizar Auth.js também não substitui revisar trechos OAuth incorporados pelo próprio Convex Auth.

## Outros problemas encontrados

### Bloqueio dirigido do login por tentativas anônimas

**Prioridade proposta pelo revisor: P2. Pré-condição: conhecer o e-mail de uma conta local.**

Dez tentativas anônimas com senha incorreta esgotaram o bucket da conta. Uma tentativa seguinte com a senha correta foi recusada com `TooManyFailedAttempts`.

O limitador é consultado antes da verificação da senha e usa o ID da conta como chave. Não foi encontrada proteção por origem no fluxo examinado. O padrão repõe dez tentativas por hora, aproximadamente uma a cada seis minutos.

Locais na biblioteca: `node_modules/@convex-dev/auth/src/server/implementation/mutations/retrieveAccountWithCredentials.ts:45`, `node_modules/@convex-dev/auth/src/server/implementation/rateLimit.ts:4` e linha 57.

É um trade-off do limitador, não um motivo para removê-lo. Acrescentar proteção por origem/abuso, alertas e um caminho controlado de recuperação ou autenticação adicional. O plano de S02 deve evitar reproduzir esse bloqueio dirigido nos tokens de recuperação.

### Par incompatível de refresh token pode encerrar sessão alheia conhecida

**Prioridade proposta pelo revisor: P3 condicionado. Pré-condição: conhecer o `sessionId` da vítima.** Não foi encontrado um vazamento desse identificador nos DTOs atuais.

Na prova local, um refresh token real da sessão A foi combinado com o ID da sessão B. A chamada pública anônima apagou B e manteve A.

Após `refreshTokenIfValid` retornar `null`, a biblioteca apaga a sessão indicada pela metade `sessionId` do argumento sem demonstrar que o token pertence a ela. Locais: `node_modules/@convex-dev/auth/src/server/implementation/mutations/refreshSession.ts:43` e linhas 54–61. A incompatibilidade é detectada em `refreshTokens.ts`, mas o tratamento posterior ainda remove a sessão fornecida.

O impacto é encerramento indevido de sessão caso o identificador seja obtido. Não é bypass de login nem roubo de conta. Verificar correção upstream ou patch versionado; uma falha na associação entre as duas metades não deve autorizar excluir uma sessão arbitrária.

## Hipóteses descartadas e limites

- `storageId` nos DTOs não demonstrou download público direto. O comentário sobre `/api/storage/<id>` no SDK aplica-se ao `StorageId` legado; o próprio SDK distingue `Id<"_storage">` atual como seguro para compartilhar. Não construir um achado usando a regra legada.
- `disconnect`, convites e downloads por capacidade bearer não foram tratados como falhas simplesmente por serem públicos.
- Não foi identificado bypass adicional de campus ou caminho demonstrável de XSS nas interpolações examinadas.
- A expiração por relógio em consultas reativas/caches merece ensaio específico: `requireNativeUser` usa `Date.now()` em queries, enquanto o JWT padrão pode viver uma hora. Não foi classificada como falha confirmada sem observar o comportamento real da plataforma.
- Geração repetida de PDF merece orçamento por usuário e concorrência; o relatório já reconhece esse risco, que não foi contado como descoberta independente.

## Validação

Três testes sintéticos aprovados em 1,16 segundo, cobrindo refresh em cadeia pela API pública local, exclusão de sessão por par incompatível e bloqueio dirigido do login. O arquivo temporário foi removido. Nenhum E2E remoto ou teste de carga foi executado.

A suíte completa da rodada anterior pertence ao baseline antigo e não certifica automaticamente Convex 1.48.0. Este parecer registra as conclusões do subagente; a consolidação distingue as provas locais das hipóteses e das recomendações.
