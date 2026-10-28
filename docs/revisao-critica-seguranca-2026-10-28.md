# Revisão crítica do plano de segurança

A revisão independente confirma os cinco pontos prioritários do [relatório original](analise-seguranca-2026-10-28.md), reforça a falha de revogação de sessões e acrescenta dois riscos de disponibilidade e duas fragilidades condicionadas. O plano precisa de ajustes antes da implementação, especialmente no custo do scrypt, na integração da revogação com Convex Auth e na propriedade dos arquivos.

Esta rodada examinou o commit `9a33d8b`, com Convex 1.48.0, Convex Auth 0.0.96 e Auth.js 0.41.1. A primeira análise e sua suíte completa pertencem a `a961e96`; os resultados não foram reapresentados como validação completa da versão nova. Código, dependências e produção foram preservados.

## Revisores e evidências

| Revisor                 | Trabalho executado                                                                                                                                | Parecer                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Subagente independente  | Leitura do relatório, código e biblioteca; três provas sintéticas locais                                                                          | [Parecer do subagente](revisoes-seguranca/subagente-2026-10-28.md)         |
| Claude Code CLI 2.1.310 | Revisão estática independente; modelo informado `claude-opus-5-5`; 94 chamadas Read/Glob/Grep; execução concluída com sucesso                     | [Parecer recebido do Claude](revisoes-seguranca/claude-code-2026-10-28.md) |
| Consolidação            | Conferência dos caminhos apontados, de contratos existentes e de referências primárias; uma prova local adicional de OAuth e 40 testes existentes | Este documento                                                             |

O Claude recebeu somente ferramentas de leitura e busca, sem execução de comandos ou escrita. A sessão foi iniciada com MCP externo desabilitado, sem persistência e sem acesso solicitado a segredos. Seus resultados de leitura não equivalem a provas executadas. As ressalvas abaixo corrigem propostas inexatas do parecer recebido.

## Ajustes nos cinco pontos originais

### S01 A revogação falha com uma única sessão

**Prioridade alta mantida.** A nova prova não precisou semear 1.001 sessões. Depois de um login real na fixture local, 1.000 chamadas públicas `auth.signIn({ refreshToken })`, sempre usando o token corrente, geraram 1.001 registros `authRefreshTokens` numa única sessão. A tentativa ADMIN de desativação falhou com `Limite de tokens excedido`, e a consulta do membro continuou retornando `active: true`.

A verificação de senha ocorreu no login inicial; não foi repetida a cada renovação. Assim, um refresh token válido permite atingir um dos limites da revogação. A cadeia está em `node_modules/@convex-dev/auth/src/server/implementation/mutations/refreshSession.ts:70`, `node_modules/@convex-dev/auth/src/server/implementation/refreshTokens.ts:14` e `convex/access/store.ts:79`.

Também não há limpeza periódica encontrada para sessões que expiram sem logout e seus tokens usados. O acúmulo operacional é outra causa possível da mesma falha, não uma vulnerabilidade independente a somar à contagem. Não se deve estimar um número fixo de jornadas até a falha sem medir os padrões de uso.

O plano deve separar **invalidação imediata** de **remoção física em lotes**. A remoção do usuário precisa persistir mesmo com milhares de sessões. Recuperação de senha e alteração de perfil precisam invalidar sessões antigas sem bloquear a criação de uma nova sessão legítima. Os lotes de limpeza devem carregar uma geração ou corte estável e nunca apagar sessões posteriores à recuperação.

Há duas ressalvas ao parecer do Claude:

- É correto que `requireNativeUser` relê o papel atual do banco e que uma redução de privilégios já seria aplicada se a mutation concluísse. Entretanto, retirar a revogação em toda troca de papel mudaria o contrato existente, explicitamente testado em `test/member-roles.test.ts`. Além disso, uma sessão antiga comprometida passaria a receber permissões recém-concedidas numa promoção. A consolidação mantém a invalidação de sessões antigas como requisito.
- Não está demonstrado que atuar na emissão/renovação de JWT exija necessariamente um fork. A biblioteca instalada oferece `config.jwt.customClaims`, chamado por `generateToken`, inclusive na renovação (`node_modules/@convex-dev/auth/src/server/implementation/tokens.ts:26`). O callback de criação de sessão não é executado a cada refresh, mas esse é outro ponto de extensão. A viabilidade e o comportamento de erro devem ser validados antes de escolher a integração.

Um corte baseado em `authSessions._creationTime` pode evitar alterar todas as sessões existentes, mas precisa de testes de fronteira temporal e de concorrência. Se for usado um número de geração no token, ele deve representar a geração original da sessão; copiar simplesmente a geração atual do usuário em cada refresh pode revalidar uma sessão antiga.

### S02 Validar antes do hash e controlar o custo persistente

**Prioridade média mantida.** Validar formato, existência e validade do token antes do hash continua necessário. A mutation final deve repetir a validação e consumir o token atomicamente. Um token válido também pode ser repetido antes de seu consumo, portanto a pré-validação não substitui limites de concorrência e trabalho.

O plano precisa especificar onde a cota é contabilizada: se um contador é escrito dentro da mesma mutation que lança erro, a cobrança pode desaparecer no rollback. Para chamadas anônimas, não assumir que uma action Convex recebe IP confiável; o contexto de funções não fornece automaticamente o `Request` de um HTTP endpoint. Um IP enviado pelo cliente não serve como identidade de segurança.

O Claude apontou outro custo dentro do mesmo problema: `requestPasswordRecovery` sempre informa que a função está indisponível, mas ainda passa por `withActionLease`, criando e removendo registros operacionais. Reduzir essa escrita inútil e tornar o caminho inválido barato ajuda mais que uma cota global facilmente esgotada por terceiros.

Mover a pré-validação para antes do lease exige preservar a manutenção: o lease ainda deve admitir e rastrear todo o trabalho que pode alterar estado. Uma leitura preliminar não autoriza prosseguir após a manutenção ser iniciada.

### S03 Rastrear o objeto e comprovar a propriedade

**Prioridade média mantida.** Restringir os uploads aos consumidores ADMIN atuais é uma mitigação pequena e prioritária, depois de conferir todos os contratos do cliente. Ela não resolve objetos órfãos de um administrador nem prova a propriedade do arquivo informado.

O Claude observou corretamente que a conclusão já aceita um `storageId` fornecido pelo cliente e que a limpeza pode apagar o objeto associado. A ressalva do relatório contra exclusão cega deve valer para esse caminho existente, não apenas para uma nova rotina de erro. O cenário condicionado está detalhado em R04.

Duas propostas do parecer precisam de correção:

- **Tamanho e data não comprovam propriedade.** Comparar metadados com a janela de criação do ticket é uma restrição adicional. Outro objeto pode ter sido criado no mesmo intervalo; a comparação não substitui um vínculo confiável entre objeto, usuário e upload.
- **Um HTTP endpoint não torna automaticamente o arquivo e o registro atômicos.** Se ele gravar o objeto na própria action e depois chamar uma mutation, haverá duas etapas separadas que exigem idempotência, compensação e reconciliação. Há, porém, uma novidade relevante no baseline atual: o changelog de Convex 1.48.0 e `node_modules/convex/src/server/storage.ts:239` disponibilizam `storage.store` também em mutations, com limites transacionais próprios. É possível avaliar o armazenamento dos bytes e o vínculo dentro de uma mesma mutation interna, após o ingresso limitado, em vez de assumir a necessidade de duas gravações separadas. O desenho precisa conferir os limites de argumentos, memória, tempo e escrita de arquivos. Nenhuma dessas alternativas foi implementada ou ensaiada no serviço remoto nesta revisão.

A reconciliação deve preservar documentos, runtime Chromium e PDFs com tickets válidos. Não transformar uma limpeza de órfãos em exclusão ampla de objetos sem referência em uma única tabela.

### S04 O custo do scrypt precisa caber na verificação de login

**Diagnóstico mantido; aumentar o parâmetro sem ensaio é um risco de implementação.** Ambos os revisores destacaram que a verificação de senha ocorre numa mutation do runtime Convex, não numa action Node: `node_modules/@convex-dev/auth/src/server/implementation/mutations/retrieveAccountWithCredentials.ts:50` chama `Provider.verify`.

A [documentação de limites Convex](https://docs.convex.dev/production/state/limits) informa 64 MiB para o runtime Convex e um segundo de execução de código de usuário por query/mutation. A [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt) lista configurações equivalentes que trocam CPU por memória. `N=2^17,r=8` usa aproximadamente 128 MiB só para scrypt, portanto não deve ser copiado mecanicamente para esse login.

Uma configuração como `N=2^14,r=8,p=5` preserva a ordem de memória da atual, mas aumenta o trabalho de CPU. É candidata a medição, não parâmetro já validado. O plano deve medir criação e verificação de senha no runtime real, dentro do orçamento e com os limitadores já funcionando. Um teste local em Node não certifica os limites remotos.

O formato v2 deve registrar os parâmetros e continuar lendo v1. A atualização de hash após login precisa de uma escrita transacional desenhada para esse fluxo; a interface de verificação, sozinha, não efetua a migração. Se a solução mudar a verificação para outro provider/runtime, também precisa preservar o limitador de falhas, a autorização, a vinculação de identidade e a revogação.

### S05 Atualizar dependência sem atribuir exploração não demonstrada

**Atualização de manutenção mantida.** A auditoria repetida no baseline atual retornou os mesmos três avisos em Auth.js 0.41.1. A aplicação continua configurando somente senha e, opcionalmente, Google, e não foi demonstrado uso dos três cenários vulneráveis no portal.

Ambos os revisores confirmaram a necessidade de revisar o fluxo OAuth incorporado por Convex Auth separadamente da versão de Auth.js. Uma atualização de um pacote não comprova correção dos trechos mantidos pelo outro. Não foi atribuída uma exploração crítica confirmada à aplicação.

## Outros problemas e sua classificação

### R01 Bloqueio dirigido do login por senha

**Prioridade média para disponibilidade. Origem: ambos os revisores; prova local do subagente.**

Uma pessoa que conhece o e-mail de uma conta local pode gastar as dez tentativas incorretas do bucket. A prova confirmou que a tentativa seguinte, com a senha correta, recebe `TooManyFailedAttempts`. O limitador é consultado antes de verificar a senha e usa o ID da conta como chave, em `node_modules/@convex-dev/auth/src/server/implementation/mutations/retrieveAccountWithCredentials.ts:45`.

O padrão repõe dez tentativas por hora, aproximadamente uma a cada seis minutos (`node_modules/@convex-dev/auth/src/server/implementation/rateLimit.ts:4`). Isso não significa que toda conta fique bloqueada por uma hora após dez falhas; com a reposição, a próxima tentativa volta a ser possível antes. Um atacante persistente pode disputar essas oportunidades.

É um trade-off real da proteção contra adivinhação, não razão para removê-la. O plano deve incluir observabilidade, desbloqueio administrativo auditado e proteção de abuso que não dependa apenas do identificador da vítima. Não confiar em IP informado em argumento pelo cliente.

O impacto atinge o login por senha e pode atingir a conta operacional usada pelo smoke da release. Uma sessão já ativa não é revogada por esse bucket; Google, quando habilitado e autorizado, pode oferecer um caminho alternativo. Nenhum bloqueio foi provocado em contas reais.

**Regressão necessária:** dez falhas anônimas, senha correta, fluxo de desbloqueio controlado e auditoria. Preservar o controle contra força bruta; testar a operação usada pelo smoke sem executar uma release nesta tarefa.

### R02 Verificadores de OAuth abandonado ficam persistidos

**Prioridade média para disponibilidade/custo, condicionada a Google habilitado. Origem: Claude; prova local adicional na consolidação.**

O início público `auth.signIn({ provider: 'google' })` chama `callVerifier` antes de completar a autenticação (`node_modules/@convex-dev/auth/src/server/implementation/signIn.ts:242`). A mutation insere um registro em `authVerifiers` sem expiração própria (`node_modules/@convex-dev/auth/src/server/implementation/mutations/verifier.ts:7`). O projeto não contém uma rotina periódica encontrada para limpar esses fluxos abandonados.

Na prova sintética, quatro chamadas anônimas consecutivas produziram quatro registros sem sessão e sem campo de expiração. O fluxo não contatou o Google, não concluiu OAuth e não usou credenciais reais; as variáveis eram exclusivamente sintéticas. A prova confirma a criação persistente, não mede escala de abuso ou comportamento de quotas da infraestrutura.

O plano deve incluir limpeza limitada por lotes de verificadores que ultrapassem a janela efetiva do protocolo OAuth e controles de abuso para o início do fluxo. A janela deve respeitar cookies, códigos e callbacks válidos, para não quebrar logins legítimos. Limpeza limita retenção; não substitui proteção contra volume de chamadas.

**Regressão necessária:** inícios abandonados envelhecem e são limpos; verificadores recentes e callbacks legítimos continuam funcionando; a continuação de lotes termina sem varrer uma tabela inteira numa transação.

### R03 Par inválido de refresh pode encerrar outra sessão conhecida

**Prioridade baixa condicionada. Origem: subagente; prova local.**

Um refresh token real da sessão A, combinado com o `sessionId` de B, foi enviado ao endpoint público sem autenticação da vítima. A biblioteca recusou a associação, mas seu tratamento de falha apagou B e manteve A.

O problema está no caminho de `validationResult === null` em `node_modules/@convex-dev/auth/src/server/implementation/mutations/refreshSession.ts:54`: ele apaga a sessão indicada pelo argumento, sem demonstrar que a primeira metade do token pertence a ela.

**Pré-condição decisiva:** conhecer o `sessionId` da vítima. A revisão não encontrou um vazamento desse identificador nos DTOs atuais. O fato de ele aparecer no subject de um JWT não demonstra, por si só, um acesso por terceiros. O achado é um encerramento indevido condicionado, não roubo de conta, bypass de login ou capacidade de enumerar sessões.

Verificar correção do fornecedor ou patch versionado. Não editar `node_modules` manualmente como solução durável e não atribuir um CVE não confirmado. Falha de associação entre as metades deve recusar a entrada sem autorizar exclusão arbitrária.

**Regressão necessária:** par A/B inválido não exclui nem invalida a sessão B; token válido ainda renova; revogação e detecção de replay continuam funcionando.

### R04 Objeto conhecido sem vínculo pode ser adotado por outro upload

**Prioridade baixa condicionada; análise de código, sem alvo prático demonstrado. Origem: Claude.**

`completeUpload` aceita um `storageId` do cliente, confere tamanho e assinatura PDF, e depois `finishUpload` verifica ausência nas tabelas `documents` e `nativeUploads`. Não existe uma prova de que o objeto foi criado pelo ticket apresentado. Se o atacante conhece um ID de PDF sem vínculo nessas tabelas e o tamanho correto, pode associá-lo ao próprio upload; a expiração poderá então excluí-lo.

Locais: `convex/actions/uploads.ts:9`, `convex/nativeFiles.ts:103` e `convex/nativeFiles.ts:154`.

O cenário é condicionado: documentos referenciados são recusados, os IDs dos PDFs gerados não são entregues pelo DTO de download e os arquivos Chromium não passam pela assinatura PDF. A revisão não demonstrou uma forma atual de obter o ID de um alvo útil alheio. A exposição de IDs de documentos já vinculados não prova exploração desse caminho.

Tratar como parte da correção S03: vínculo confiável de propriedade, permissões mínimas e limpeza segura. A data/tamanho do objeto não bastam como prova de dono.

## Sugestões que não viraram novos achados confirmados

- **Acúmulo ordinário de sessões:** incorporado a S01, para evitar contagem duplicada.
- **`storageId` e hash em DTOs:** podem ser omitidos por minimização, mas IDs atuais do Storage não equivalem automaticamente a uma URL pública. Os documentos vinculados também são recusados no caminho de adoção R04. Não classificado como vazamento de conteúdo.
- **Enumeração por tempo de login:** diferença entre conta inexistente e scrypt de conta existente é plausível, mas não houve medição remota controlada nem comprovação da utilidade do sinal. Hipótese pendente.
- **Expiração em queries com `Date.now()`:** a [documentação Convex](https://docs.convex.dev/understanding/best-practices#dont-use-datenow-in-queries) explica que o avanço do relógio não atualiza sozinho uma assinatura. Isso merece ensaio conjunto com expiração do JWT e revalidação da plataforma; não foi demonstrada uma sessão com acesso indevido após o vencimento.
- **Código de instalação:** retirar o segredo depois de instalar reduz superfície. A revisão não demonstrou um ataque de timing remoto contra a comparação existente.
- **Backups ignorados pelo Git dentro da árvore local:** o Claude viu nomes de diretórios; seus conteúdos não foram lidos. O script de release impõe destino externo para os novos backups que cria, mas isso não certifica a origem ou proteção de arquivos privados antigos. Cabe conferência administrativa local separada.
- **XSS, acesso entre campi e download direto por ID:** nenhum novo caminho explorável foi identificado nas cadeias examinadas. Isso não substitui a verificação de dados legados ou um pentest remoto.

## Plano revisado para implementação

1. **Corrigir S01 com bloqueio imediato e limpeza desacoplada.** Cobrir remoção, recuperação, alteração de papel/campus, refresh, concorrência e sobrevivência de novos logins. Preservar a exigência atual de invalidar sessões anteriores em mudança de perfil.
2. **Tornar caminhos anônimos baratos e limitar processamento útil.** Validar tokens antes de scrypt/leases, manter consumo atômico e cotas que persistam diante de rejeições. Incluir a superfície OAuth abandonada e o bloqueio dirigido por conta; evitar criar uma nova cota global esgotável por terceiros.
3. **Reduzir permissões de upload e fechar propriedade/limpeza.** Controlar bytes reais recebidos, identificar objetos criados pelo próprio ingresso e prever falhas entre armazenamento e gravação do vínculo. Preservar arquivos legítimos na reconciliação.
4. **Atualizar dependências e avaliar o problema condicionado do refresh.** Revisar separadamente Auth.js e Convex Auth, sem supor que um upgrade corrige automaticamente os trechos do outro. Atualização pequena de manutenção pode ser antecipada se validada isoladamente; esta ordem não exige agrupá-la à refatoração.
5. **Escolher o hash v2 dentro do orçamento real.** Preservar leitura v1, registrar parâmetros e ensaiar criação/verificação/migração com a proteção de abuso já presente. Não adotar `N=2^17` no runtime atual sem resolver o orçamento de memória.
6. **Completar higiene e resposta a incidentes.** Limpeza em lotes, desbloqueio auditado, alertas, retenção e autenticação recente/MFA para ADMIN. Verificar acessos e backups das plataformas separadamente.

Cada etapa de código deve acrescentar suas regressões e concluir com `pnpm check`. Uma implementação que altere o gerador, modelo ou dependências do runtime PDF exige também `pnpm test:runtime:linux`. Ensaio de autenticação real deve usar desenvolvimento autorizado ou deployment descartável com opt-in específico; não faz parte da autorização de análise desta rodada.

## Comandos e resultados desta rodada

- `pnpm exec intent list`: disponível; nenhuma substituição ou instalação de dependência.
- Claude Code CLI: execução concluída com sucesso, somente leitura; parecer integral preservado em arquivo separado.
- `pnpm test:unit test/convex-native-auth.test.ts test/native-files.test.ts test/member-roles.test.ts test/native-domain.test.ts test/presence.test.ts`: cinco arquivos e 40 testes aprovados em 1,22 segundo.
- Subagente: três testes temporários aprovados em 1,16 segundo, cobrindo o caminho público de refresh em cadeia, par incompatível e bloqueio dirigido de senha.
- `pnpm exec vitest run test/.temp/security-oauth-review-validation.test.ts`: uma prova local de OAuth aprovada; somente variáveis sintéticas e sem requisição ao Google. O arquivo temporário foi removido.
- `pnpm audit --json`: código 1 pelos mesmos três avisos em Auth.js 0.41.1; um crítico, um alto e um moderado no registro. Nenhum novo caminho de exploração desses avisos foi demonstrado.

As alterações entregues nesta rodada são documentais. A formatação dos três novos documentos foi conferida separadamente. Não foi repetido `pnpm check` completo no novo baseline, não houve E2E remoto, carga, deploy ou modificação de dados reais. As provas sintéticas reproduzem os comportamentos descritos; não certificam limites, latência ou isolamento do serviço remoto.
