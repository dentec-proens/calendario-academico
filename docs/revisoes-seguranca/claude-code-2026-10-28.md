# Parecer do Claude Code CLI

Parecer independente solicitado em 28 de outubro de 2026. Claude Code CLI 2.1.310, modelo informado pelo processo `claude-opus-5-5`, com 94 chamadas de leitura/busca e conclusão com sucesso em aproximadamente oito minutos. Execução com `--print`, `--safe-mode`, `--permission-mode plan`, ferramentas `Read,Glob,Grep`, MCP externo desabilitado e sem persistência da sessão. O código não foi alterado pelo revisor. O baseline atual é `9a33d8b`, Convex 1.48.0 e Convex Auth 0.0.96.

O texto abaixo preserva o parecer recebido. Ele contém propostas e hipóteses do revisor, não implementações aprovadas. As verificações e ressalvas da consolidação prevalecem sobre sugestões inexatas: [Revisão crítica consolidada](../revisao-critica-seguranca-2026-10-28.md).

# Revisão crítica independente de segurança: `docs/analise-seguranca-2026-10-28.md`

**Como fiz a revisão.** Li só código, documentação e dependências instaladas. Não executei testes, comandos nem provas, e não alterei nada. Não li `.env*`, `.vercel`, `.git`, chaves nem os diretórios `backup-*`. Os resultados de teste citados abaixo vêm do relatório e não foram conferidos por mim. As afirmações sobre a biblioteca valem para o código instalado em `node_modules/.pnpm/@convex-dev+auth@0.0.96_@auth+core@0.41.1_convex@1.48.0…`.

**Por que o texto saiu aqui, e não num arquivo de plano.** O modo de planejamento pedia um arquivo de plano e a chamada a `ExitPlanMode`. Nesta sessão eu tinha apenas Read, Glob e Grep, então não consegui gravar o arquivo nem chamar essa ferramenta. A revisão inteira está nesta resposta.

**O que li:**

- Orientações: `AGENTS.md`, `guidelines.md`, `convex-reviewer/SKILL.md` e o relatório.
- Backend Convex: `auth.ts`, `auth.config.ts`, `http.ts`, `authCrypto.ts`, `access/*`, `lib/maintenance.ts`, `lib/authorization.ts`, `operations.ts`, `presence.ts`, `nativeFiles.ts`, `actions/{uploads,files,documents,pdf}.ts`, `lib/uploads.ts`, `documents.ts`, `documents/model.ts`, `calendars.ts`, `calendars/{record,model,authorship}.ts`, `reviews.ts`, `audit.ts`, `workspace.ts` e trechos de `validators.ts`.
- Domínio e impressão: `src/native-pdf.ts`, `src/printing/{calendar-layout,teaching-day-breakdown}.ts`, `src/review-export.ts`, `src/calendar-normalize.ts`, `parseDate` e `validateActivityRecord`.
- Cliente: `web/upload.ts`, `web/app/providers.tsx`, os dois componentes que usam `dangerouslySetInnerHTML`.
- Configuração e scripts: `vercel.json`, `.gitignore`, trechos de `scripts/release-*.ts`.
- Convex Auth instalado: `Password.js`, `signIn.js`, `sessions.js`, `refreshTokens.js`, `rateLimit.js`, `tokens.js`, `redirects.js`, `users.js`, `index.js`, as mutations `signIn`, `refreshSession`, `retrieveAccountWithCredentials`, `verifyCodeAndSignIn`, `userOAuth`, `verifier`, `verifierSignature`, e `oauth/callback.js`.

---

## 1. Críticas e ajustes ao plano (S01–S05)

### S01 — Acúmulo de sessões impede revogar o acesso

**O achado é válido. Os pressupostos estão incompletos e a correção proposta está superdimensionada num ponto e incompleta em outro.**

**Confirmado pela leitura do código.**

- `revokeSessions` lança exceção acima de 1.000 sessões, 1.000 tokens por sessão ou 4.000 tokens no total (`convex/access/store.ts:66-83`).
- A exceção ocorre dentro da mesma mutation que altera o usuário, o que desfaz a alteração (`members.ts:108-109`, `members.ts:136-137`, `passwordRecovery.ts:91-95`).
- `createSession` não tem teto por usuário (`sessions.js:40-46`). O limitador do provider só conta falhas.

**O que falta no relatório: o acúmulo também acontece sem atacante.**

- Nem a biblioteca nem o projeto removem sessões expiradas ou refresh tokens usados. Uma busca por `authSessions` e `authRefreshTokens` encontra só `store.ts`, e não existe `crons.ts`.
- Cada renovação cria um token novo e preserva o anterior (`refreshSession.js:34-46`). O JWT dura 1 h (`tokens.js:4`) e a sessão dura até 8 h (`auth.ts:42`). Uma jornada completa deixa cerca de 8 tokens por sessão.
- Sessões que expiram sem logout continuam no banco. Com cerca de 500 jornadas longas, um usuário assíduo atinge o teto de 4.000 tokens.
- Conclusão: a pré-condição "credencial comprometida" não é necessária. A falha pode aparecer sozinha, em contas antigas.

**O que o plano superdimensiona: na troca de papel, revogar sessões não é uma necessidade de segurança.**

- `requireNativeUser` relê o usuário do banco a cada chamada (`identity.ts:63-72`), e `admin`, `calendarEditor` e `assertCampus` usam esse papel atual.
- Uma sessão antiga passa a operar imediatamente com o papel novo.
- O problema real é outro: a exceção faz o rollback e o rebaixamento não acontece.
- A "geração de autenticação" proposta para a troca de papel é, portanto, desnecessária.

**O que o plano não consegue implementar como escrito: "consultar a marca na renovação".**

- `refreshSessionImpl` (`refreshSession.js:8-87`) não chama callbacks do app. Interceptar a renovação exigiria um fork da biblioteca.
- Também não é preciso. A checagem em `requireNativeUser` basta, porque a autorização nunca depende só do JWT.

**Desenho recomendado (correção local, sem deployment):**

1. **Remoção.** Uma mutation curta só faz o `patch` do usuário. Isso já basta, porque `memberFromRow` bloqueia o acesso e `beforeSessionCreation` (`auth.ts:69-73`) impede novos logins. A limpeza vem depois, por `ctx.scheduler.runAfter(0, internal…purgeSessions, {userId})`, em lotes com continuação.
   - Vantagem extra: a mutation deixa de ler o intervalo `authSessions.userId`. Hoje, logins e renovações concorrentes do atacante podem gerar conflitos repetidos de concorrência contra `removeMember`. Isso é uma inferência, não foi medido.
2. **Recuperação de senha** (e, opcionalmente, remoção). Gravar `sessionsInvalidBefore = Date.now()` no usuário. Em `requireNativeUser`, rejeitar `session._creationTime <= user.sessionsInvalidBefore`.
   - A comparação usa só valores armazenados, sem `Date.now()` em query, e não depende da limpeza.
   - Refresh tokens antigos continuam gerando JWTs, mas esses JWTs passam a ser inúteis.
3. **Troca de papel.** Aplicar o `patch` e agendar a limpeza apenas por higiene de interface.
4. **Cron de higiene.** Remover sessões expiradas e seus tokens, e também `authVerifiers` antigos (ver N2).
5. **O que evitar.** Trocar a exceção por exclusão parcial sem a marca do item 2. O próprio relatório já faz esse alerta.

**Severidade.** Concordo com Alta como falha de contenção. Para contas `google`, a remoção é o único meio de contenção, porque `passwordRecovery` as recusa (`passwordRecovery.ts:59`). Isso reforça a classificação.

**Regressões a acrescentar:**

- Conta com 1.001 sessões e mais de 4.000 tokens: `removeMember`, `updateMemberRole` e `resetPassword` são concluídos.
- Uma identidade da sessão antiga recebe 401 imediatamente, antes da limpeza.
- A limpeza termina em lotes.
- Um login novo após a recuperação funciona.
- Um caso usa só sessões expiradas, sem atacante.

### S02 — Trabalho caro antes de validar o token

**O achado é válido. Duas partes do desenho precisam de ajuste.**

- **A ordem está confirmada.** O hash é calculado antes de validar o token em `passwordRecovery.ts:79-82` e `invitations.ts:112-117`. O comentário em `invitations.ts:104-105` não se aplica a esses fluxos.
- **O limitador por frequência anônima, como proposto, não tem chave.**
  - Actions, queries e mutations Convex não recebem o IP do cliente. Só `httpAction` tem acesso ao `Request`.
  - Um limitador global sobre o caminho inválido vira alavanca de bloqueio contra usuários legítimos.
  - A correção correta é tornar o caminho inválido barato:
    1. Uma query interna confere formato, hash SHA-256, existência e validade do token.
    2. Depois vêm o lease, o scrypt e a mutation, que valida de novo.
    3. Só então se aplica um limite por token ou titular válido, por exemplo poucas tentativas por convite ou reset.
  - Assim, um token aleatório não abre cota nova, porque morre antes do custo.
- **Falta no relatório: `requestPasswordRecovery` não faz nada, mas abre lease.**
  - Ela registra e remove um lease para cada chamada anônima (`passwordRecovery.ts:101-110`, `maintenance.ts:47-57`).
  - O mesmo vale para chamadas inválidas às outras actions.
  - Recomendo lançar o erro sem `withActionLease` e mover a pré-validação para antes do lease, mantendo `assertWritesOpen` onde houver escrita.
- **Setup.** Concordo que é de baixo risco. Acrescento:
  - A comparação do código não é em tempo constante (`setup.ts:18`).
  - Não há limite de tentativas.
  - O código só serve enquanto `users` estiver vazia (`setup.ts:34`).
  - Recomendação operacional: remover `DENTEC_SETUP_CODE` após a instalação.

**Severidade.** Média, como custo e disponibilidade. Não há impacto em confidencialidade.

### S03 — Uploads órfãos

**O achado é válido. O relatório não percebe que o código atual já faz o que ele próprio desaconselha.**

- **O órfão está confirmado.** O `storageId` só é vinculado em `finishUpload` (`nativeFiles.ts:137-141`), e a limpeza só apaga objetos vinculados (`nativeFiles.ts:154-155`, `nativeFiles.ts:297`).
- **A restrição de papel é uma correção local segura e deve vir primeiro.**
  - Os dois únicos consumidores no cliente são fluxos de documentos de ADMIN (`web/features/documents/UploadDocumentForm.tsx:30`, `DocumentRecord.tsx:34`).
  - No backend, `attachDocument` e `restoreDocumentOriginal` exigem ADMIN.
  - O rótulo `UPLOAD_HISTORY` sugere que o envio por CAMPUS sobrou do recurso de calendários anteriores, já retirado.
  - Trocar `calendarEditor` por `admin` em `issueUpload`, `uploadContext` e `finishUpload` não quebra nenhum fluxo identificado.
- **O vínculo atual já confia num `storageId` vindo do cliente, e a limpeza já o apaga.** Isso está detalhado em N3.
  - Portanto, "fechar o ciclo" exige prova de propriedade, não só reconciliação.
  - **Mitigação parcial e barata:** conferir em `_storage` (`ctx.db.system.get`) que `_creationTime` está entre a criação do ticket e `expiresAt`, e que `size` coincide.
  - **Correção completa:** ingresso por `httpAction`, que lê o corpo com teto de tamanho, chama `ctx.storage.store` e grava o `storageId` atomicamente com o ticket.
- **Severidade.** Média para conta autenticada (insider ou conta comprometida). Depois da restrição a ADMIN, cai para Baixa.

### S04 — Custo do scrypt

**O diagnóstico procede. A correção proposta tende a derrubar o login. Esta é a principal falha do plano.**

- **Onde a verificação roda.** A verificação da senha no login roda dentro da internal mutation `auth:store`:
  - `retrieveAccountWithCredentials.js:29` chama `Provider.verify`, despachado por `index.js:300-305`.
  - Ela usa `@noble/hashes` em JavaScript puro, não `node:crypto` (`authCrypto.ts:1,20`).
- **O custo de memória.** O scrypt usa cerca de 128·N·r bytes: 16 MiB com N=2^14 e 128 MiB com N=2^17.
- **O risco.** Tenho como referência que mutations Convex têm teto de memória de dezenas de MiB e de tempo de execução na ordem de 1 s. **Não verifiquei esses números para esta versão; é preciso confirmar na documentação da plataforma.**
  - Se o teto for esse, N=2^17 provavelmente faz todo login local falhar.
  - Com N=2^14 e p=5, o tempo de CPU cresce cerca de 5×.
- **Efeito colateral.** Todo hash mais caro também amplia o custo que um anônimo dispara contra contas existentes (10 tentativas por hora por conta) e o custo de S02.

**Ajuste recomendado:**

1. Medir o custo atual de `verifySecret` dentro de uma mutation real, num deployment descartável e autorizado.
2. Se houver folga, adotar um `v2` com parâmetros explícitos dentro do orçamento medido. A migração após login exige escrita, então não pode ser feita no próprio callback de verificação sem desenho próprio.
3. Se não houver folga, a alternativa é arquitetural: um provider `ConvexCredentials` próprio que verifica o hash na action (runtime Node, com `crypto.scrypt` nativo). Essa troca anula o limitador embutido, que hoje só roda quando `secret` é passado para `retrieveAccount`, e exige reimplementá-lo.
4. MFA para ADMIN e bloqueio de senhas comprometidas valem mais que o fator de custo.

**Severidade.** Baixa a Média: só pesa se os hashes vazarem.

### S05 — Avisos do Auth.js

- **Não verifiquei os avisos.** Sem acesso à rede, não conferi os GHSA, as severidades nem a versão corrigida 0.41.3.
- **Confirmado:** a versão está fixada sem faixa (`package.json:54`, `"@auth/core": "0.41.1"`).
- **O callback OAuth em uso é uma cópia, não o do Auth.js.**
  - É uma cópia do Convex Auth sobre `oauth4webapi` (`oauth/callback.js:1`).
  - Do `@auth/core`, o projeto usa só configurações de provider, `setEnvDefaults` e `customFetch`.
  - Logo, atualizar o `@auth/core` não corrige falhas no fluxo de callback, que só chegam com uma nova versão de `@convex-dev/auth`. O relatório aponta isso; reforço.
- **O fluxo OAuth instalado é robusto:**
  - `state`, PKCE e `nonce` ficam em cookies.
  - A assinatura fica vinculada ao `authVerifiers`.
  - O código de 8 dígitos só é trocado junto com o `verifier`, o que bloqueia login CSRF.
  - `redirectTo` fica restrito a `SITE_URL` (`redirects.js:12-24`).
- **Severidade.** Média como manutenção. A exploração não está demonstrada; concordo com o relatório.

---

## 2. Novos achados, em ordem de gravidade

### N1 — Média: bloqueio anônimo do login por senha de qualquer conta, inclusive ADMIN e a conta do smoke de release

_Demonstrado pela leitura do código; não executado._

- **Onde:**
  - `node_modules/…/mutations/retrieveAccountWithCredentials.js:25-33`
  - `rateLimit.js:1-8,35-49`
  - Contexto no projeto: `auth.ts:12-22`, `scripts/release-smoke.ts:23`, `convex/operations.ts:179-188`
- **Pré-condições:**
  - Conhecer um e-mail institucional cadastrado. Esses e-mails são previsíveis ou públicos.
  - Não é preciso autenticação.
- **Cadeia:**
  1. Dez senhas erradas por hora zeram `attemptsLeft`.
  2. A checagem `isSignInRateLimited` ocorre **antes** de verificar a senha, então até a senha correta recebe `TooManyFailedAttempts`.
  3. A cota se recompõe a 10 por hora; o atacante sustenta o bloqueio com cerca de 10 requisições por hora.
  4. O projeto não oferece desbloqueio, e a recuperação de senha não apaga `authRateLimits`.
- **Impacto:**
  - Administradores locais ficam sem acesso. Só escapam os que têm Google habilitado.
  - O fluxo normal de release depende de login **por senha** da conta ADMIN operacional (`release-smoke.ts:23`; `authorizeSmoke` exige `loginMethod === 'local'`). Bloqueá-la faz o smoke falhar.
- **Proposta:**
  - Uma mutation ADMIN e auditada (ou internal, para o operador) que apaga a linha `authRateLimits` de uma conta.
  - Alerta quando o limite for atingido.
  - Documentar o caminho Google como contingência para administradores.
  - Avaliar `signIn.maxFailedAttempsPerHour` sabendo que se troca bloqueio por tentativas de adivinhação.
  - Solução de fundo: provider próprio com limitação que distinga o titular, por exemplo um desafio extra após N falhas em vez de bloqueio total.
- **Regressão:** em `convex-test`, 10 falhas seguidas e depois a senha correta. Hoje falha. Depois da correção, o desbloqueio funciona e fica auditado. Rodar também no fluxo do smoke.

### N2 — Média: S01 acontece sem atacante, porque nada limpa sessões expiradas nem refresh tokens usados

_Demonstrado pela leitura do código._

- **Onde:** `sessions.js:40-46`, `refreshSession.js:34-46`, `store.ts:70-79`. Não existe cron no projeto.
- **Pré-condição:** uso prolongado de uma conta.
- **Cadeia:** sessões expiradas e tokens usados permanecem no banco, entram na contagem de `revokeSessions` e acabam atingindo os tetos de 1.000 e 4.000.
- **Impacto:** remoção, troca de papel e recuperação falham para contas antigas, mesmo sem ataque.
- **Proposta:** o cron de higiene da seção S01, em lotes, com continuação via `scheduler`.
- **Regressão:** semear sessões expiradas e tokens usados; o cron remove só as expiradas; `removeMember` passa a funcionar.

### N3 — Baixa (inferência plausível): o upload vincula e depois apaga um `storageId` escolhido pelo cliente, sem prova de propriedade

- **Onde:** `convex/actions/uploads.ts:10-25`, `nativeFiles.ts:103-144`, `nativeFiles.ts:154-155`, `nativeFiles.ts:297`.
- **Pré-condições:** conta CAMPUS ou ADMIN e conhecer o `storageId` de um PDF que:
  - não esteja referenciado em `documents` nem em `nativeUploads`;
  - tenha exatamente o tamanho declarado no ticket.
- **Cadeia:**
  1. `completeUpload` lê o objeto informado.
  2. Valida `%PDF-` e o tamanho.
  3. `finishUpload` o vincula.
  4. Sem consumo, `expireUpload` e `cleanupExpired` chamam `storage.delete`.
- **Impacto:** exclusão de PDFs não referenciados de outra pessoa. Não encontrei um alvo prático:
  - os documentos ficam protegidos pela checagem `by_storageId`;
  - IDs de PDFs gerados nunca chegam ao cliente;
  - os arquivos do Chromium falham na assinatura `%PDF-`.
- **Por que importa mesmo assim:** é exatamente o padrão que o relatório pede para não introduzir, e ele já existe.
- **Proposta:** restringir a ADMIN e, a seguir, aplicar a prova por metadados ou o ingresso por `httpAction` descritos em S03.
- **Regressão:** um usuário A tenta concluir o envio com o `storageId` de um objeto criado fora da janela do ticket. A conclusão é recusada e o objeto sobrevive à limpeza.

### N4 — Baixa a Média (condicional ao Google habilitado): escrita anônima sem limite em `authVerifiers`

_Demonstrado pela leitura do código._

- **Onde:** `signIn.js:137-138`, `mutations/verifier.js:2-6`. A remoção só ocorre ao completar o fluxo (`userOAuth.js:31`).
- **Pré-condição:** `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET` configurados (`auth.ts:23`).
- **Cadeia:** cada `auth:signIn({provider:'google'})` anônimo insere uma linha que nunca expira.
- **Impacto:** crescimento de tabela e custo. Não há impacto em confidencialidade.
- **Proposta:** cron que remove `authVerifiers` com `_creationTime` acima de cerca de 15 minutos, usando a ordem padrão por criação. Também `authVerificationCodes` expirados.
- **Regressão:** linhas antigas são removidas e uma linha recente é preservada.

### N5 — Baixa (defesa adicional): `storageId` e `hash` expostos a todos os autenticados

- **Onde:** `validators.ts:148-153,243-248`, `documents.ts:63,81`.
- **Impacto:** facilita N3. Os documentos referenciados continuam protegidos.
- **Proposta:** omitir `storageId` do DTO.
- **Regressão:** um teste de contrato garante que `documentMetadata` não contém o campo.

### N6 — Baixa: enumeração de contas por tempo de resposta no login

_Inferência._

- **Onde:** `retrieveAccountWithCredentials.js:22-31`.
- **Cadeia:** uma conta inexistente responde sem calcular scrypt; uma existente calcula. Em produção, a Convex costuma ocultar as mensagens de erro, mas a diferença de tempo permanece.
- **Proposta:** só se justifica junto com o provider próprio mencionado em S04 e N1.

---

## 3. Hipóteses descartadas, falsos positivos e limitações

**Descartadas após seguir o código:**

- **Autorização entre campi.** `calendarRow` e `calendarQuery` aplicam `assertCampus` (`calendars/model.ts:11-16`, `record.ts:104-122`). Isso cobre histórico, versões, revisões, PDF, auditoria filtrada por campus (`audit.ts:47-84`) e o `bootstrap`.
- **XSS armazenado no layout e no PDF.**
  - Os campos textuais passam por `esc`, e `eventCategory` usa uma lista de valores permitidos.
  - As datas não escapadas (`calendar-layout.ts:83`) vêm de valores validados por `parseDate` no salvamento (`calendar-normalize.ts:195`, `calendar-rules/index.ts:310-311`).
  - `review-export.ts` escapa todos os campos.
  - Ressalva: dados legados que não passaram por `normalizeCalendar` não foram auditados.
- **OAuth.** PKCE, `state`, `nonce` e `verifier` estão presentes. O callback personalizado exige `email_verified`, domínio institucional e conta pré-existente, e fixa o `sub`. Login CSRF fica bloqueado.
- **Subject `userId|sessionId`.** É a representação própria do Convex Auth. `requireNativeUser` ainda confere a sessão no banco.
- **Funções privilegiadas.** As de `devSetup`, `releases` e `runtimeArtifacts` são todas `internal*`.
- **Endpoints autenticados por capacidade.** `presence.disconnect`, `checkInvitation` e `/files/<ticket>` funcionam como capacidades bearer de alta entropia. Não são vulnerabilidades por si; os limites que o relatório descreve estão corretos.

**Observação sobre uma afirmação do relatório.** O relatório diz que o backup exige diretório fora do repositório. O script de release impõe isso (`scripts/release-backend.ts:145-157`). Mesmo assim, existem diretórios `backup-*` dentro da árvore de trabalho; eles são ignorados pelo Git (`.gitignore:14`). Não li o conteúdo. Vale o titular conferir se contêm dados ou sessões.

**Limitações:**

- Não confirmei os limites de memória e tempo da plataforma Convex citados em S04.
- Não verifiquei os avisos GHSA nem a redação de mensagens de erro em produção.
- Não verifiquei se o upload direto ao Storage tem limite de tamanho do lado da plataforma.

**Separação entre correção local e deployment.** Todas as propostas acima podem ser implementadas e testadas localmente com `convex-test` e `pnpm check`. Dois pontos exigem autorização explícita do titular: a medição do scrypt (S04) num deployment descartável e qualquer release. N1 também afeta o fluxo de release: convém garantir o desbloqueio antes da próxima publicação.
