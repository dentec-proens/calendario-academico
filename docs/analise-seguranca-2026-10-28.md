# Análise de segurança da aplicação

Análise realizada em 28 de outubro de 2026 sobre o commit `a961e96`, com revisão do código local, das dependências instaladas e dos headers públicos do portal. A arquitetura apresenta boas barreiras de autorização e não armazena senhas em texto puro. O principal problema confirmado permite que o acúmulo de sessões impeça desativar uma conta, alterar seu perfil e redefinir sua senha.

A investigação original preservou o código e as dependências. Suas provas usaram somente dados sintéticos em `convex-test`; não houve autenticação, alteração de dados ou testes de carga em produção. A revisão crítica posterior foi incorporada abaixo como plano de implementação sobre `9a33d8b`, com Convex 1.48.0. Os pareceres independentes e as hipóteses permanecem disponíveis na [revisão consolidada](revisao-critica-seguranca-2026-10-28.md). Os resultados históricos não comprovam a implementação nem a validação do código novo.

## Prioridades

| Identificação | Prioridade            | Achado                                                                                          | Evidência                                                                      |
| ------------- | --------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| S01           | Alta                  | Acúmulo de sessões impede revogar o acesso                                                      | Reprodução local da falha de desativação, troca de papel e recuperação         |
| S02           | Média                 | Convite e recuperação calculam hash antes de validar o token, sem limitação própria de chamadas | Reprodução local com tokens inválidos e observação da chamada de hashing       |
| S03           | Média                 | Upload rejeitado ou abandonado pode permanecer no Storage sem limpeza                           | Reprodução local de arquivo rejeitado que sobrevive às duas rotinas de limpeza |
| S04           | Média                 | Parâmetros scrypt abaixo das configurações recomendadas atualmente pela OWASP                   | Inspeção da implementação e comparação com a referência oficial                |
| S05           | Média para manutenção | Auth.js instalado possui três avisos de segurança                                               | `pnpm audit`; exploração dos três cenários não demonstrada nesta configuração  |

As prioridades consideram a aplicação examinada. A classificação crítica de um aviso de dependência não comprova uma vulnerabilidade crítica explorável no portal.

## S01 Acúmulo de sessões impede revogar o acesso

**Locais:** `convex/access/store.ts:66`, `convex/access/members.ts:79`, `convex/access/members.ts:115`, `convex/access/passwordRecovery.ts:86`.

`revokeSessions` lê até 1.001 sessões e lança erro quando encontra mais de 1.000. Também lança erro acima de 1.000 refresh tokens por sessão ou 4.000 tokens no conjunto processado. A função é chamada dentro da mesma transação que altera o usuário ou sua senha.

Em `removeMember`, o sistema marca a conta como inativa e, em seguida, tenta excluir suas sessões. Ao atingir o limite, a exceção desfaz toda a transação, inclusive a inativação. A conta continua ativa. A troca de papel e a recuperação de senha apresentam o mesmo problema: o papel anterior e a senha anterior são preservados pelo rollback.

**Reprodução:** uma fixture de CAMPUS com sua sessão original recebeu mais 1.000 registros de sessão, todos sintéticos. A chamada pública de remoção, realizada pela fixture ADMIN, falhou com `Limite de sessões excedido`; a consulta da conta continuou retornando `active: true`. A troca para PARECERISTA falhou e manteve CAMPUS. Uma recuperação válida também falhou e conservou o hash anterior. O teste confirmou as três consequências na mesma fixture.

A preparação inseriu sessões diretamente no banco sintético. Não foi realizado um ensaio de 1.001 logins remotos. A implementação instalada de Convex Auth cria sessões em novos logins e substitui somente a sessão atual quando ela é fornecida; logins independentes sem sessão não possuem um teto por usuário no código examinado. O limitador padrão atua nas tentativas malsucedidas de senha, não limita esse acúmulo por logins válidos.

**Impacto:** uma conta com credenciais comprometidas pode dificultar a contenção pelo próprio aplicativo. O problema também pode ocorrer por acúmulo operacional de sessões. Não concede acesso inicial nem eleva o papel da conta, mas enfraquece uma proteção necessária durante um incidente.

**Correção recomendada:** invalidar o acesso de forma atômica e independente da exclusão de todos os registros. Para alterações de papel e recuperação, adotar uma geração de autenticação ou marca de revogação consultada no login, na renovação e nas operações protegidas; depois, remover sessões e tokens antigos em lotes internos. A inativação do usuário já é conferida por `requireNativeUser`, mas a troca de papel e a recuperação também precisam impedir o reaproveitamento de credenciais de sessão anteriores. Não basta trocar o erro por uma exclusão parcial que deixe sessões válidas.

A revisão posterior demonstrou um caminho mais simples pela API pública local: um login seguido de 1.000 renovações gerou 1.001 refresh tokens numa única sessão; a desativação falhou e a conta permaneceu ativa. Sessões expiradas e tokens antigos também podem acumular por uso normal. O problema não depende de repetir scrypt nem de possuir a senha depois de obter um refresh token válido.

A invalidação deve preservar o contrato de revogação após alteração de papel/campus e impedir que uma sessão antiga herde uma promoção. A limpeza precisa usar um corte estável para preservar novos logins. Não copiar a geração atual do usuário para uma sessão velha em cada refresh. A biblioteca oferece `jwt.customClaims` durante emissão/renovação; verificar esse ponto de extensão antes de presumir um fork.

Adicionar regressões permanentes para os limites de sessões e tokens, incluindo a cadeia real de refresh, comprovando bloqueio imediato de sessões antigas mesmo com limpeza pendente e sobrevivência de uma nova sessão legítima.

## S02 Ações públicas permitem trabalho caro antes da validação

**Locais:** `convex/access/passwordRecovery.ts:74`, `convex/access/invitations.ts:107`, `convex/lib/maintenance.ts:44`, `convex/operations.ts:30`.

`resetPassword` calcula scrypt antes de `consumeReset` verificar se o token existe, está vigente e ainda pode ser usado. `acceptInvitation` faz o mesmo antes de `consumeInvitation`. O comentário sobre autorizar antes do trabalho pesado em `invitations.ts` não corresponde a esses fluxos.

O wrapper de manutenção registra um lease e o remove ao terminar, mas não limita frequência ou concorrência. Esses endpoints não passam pelo limitador de falhas de login de Convex Auth. Uma senha com tamanho permitido e um token inválido bastam para solicitar o cálculo; no convite, o e-mail precisa apenas passar pela validação institucional anterior ao hash.

**Reprodução:** um observador sobre `passwordCrypto.hashSecret` confirmou uma chamada no reset com token inválido e outra na ativação com token inválido. Ambas terminaram rejeitadas pela validação posterior. Isso comprova a ordem das operações, não uma indisponibilidade medida em produção.

**Impacto:** abuso anônimo de CPU, chamadas e escritas operacionais, com possível aumento de custo e competição por recursos. Aumentar o custo do hash antes de resolver esse fluxo amplia o trabalho solicitado por chamada abusiva.

**Correção recomendada:** validar formato, existência, expiração e identidade do token antes de calcular o hash; manter a segunda validação e o consumo atômico na mutation final para impedir corrida e reutilização. Acrescentar limitação de frequência e orçamento de concorrência, combinando critérios para não permitir ataques de bloqueio contra um único titular. Token aleatório ou inválido não deve abrir uma nova cota independente ilimitada.

A cobrança da cota não pode desaparecer no rollback da mutation que rejeita uma tentativa. Actions Convex não recebem automaticamente um IP confiável; não usar IP informado pelo cliente como identidade. Limitar trabalho de tokens válidos e manter o caminho inválido barato, sem criar uma cota global facilmente esgotada por terceiros. A pré-validação não dispensa a admissão de manutenção antes de iniciar o trabalho efetivo.

`requestPasswordRecovery`, sempre indisponível, não deve escrever leases inutilmente. O setup inicial também merece limitação de trabalho, embora já confira o código antes do hash. O rate limiting da borda do frontend não cobre chamadas diretas ao backend Convex.

## S03 Uploads rejeitados podem ficar órfãos

**Locais:** `web/upload.ts:9`, `convex/nativeFiles.ts:46`, `convex/actions/uploads.ts:9`, `convex/nativeFiles.ts:145`, `convex/nativeFiles.ts:285`.

O navegador envia os bytes diretamente ao Storage antes de chamar `completeUpload`. Essa action verifica tamanho real e assinatura `%PDF-`, mas associa o `storageId` ao registro temporário somente depois de todas as verificações, em `finishUpload`.

Se a assinatura for inválida, o tamanho divergir, o arquivo exceder o limite da aplicação ou o cliente abandonar o fluxo depois do POST, o arquivo já pode existir no Storage enquanto `nativeUploads.storageId` permanece ausente. As rotinas `expireUpload` e `cleanupExpired` só excluem o arquivo quando esse campo está preenchido. Excluir o registro temporário não exclui o objeto sem vínculo.

**Reprodução:** um objeto sintético representando o POST anterior à conclusão recebeu conteúdo que não era PDF. A action pública rejeitou o arquivo. Depois de executar `expireUpload` e `cleanupExpired`, o registro temporário não existia mais, mas o objeto continuava acessível por `ctx.storage.get` na fixture.

O limite de três uploads pendentes reduz a emissão de tickets, mas não rastreia esses objetos e não constitui uma cota durável de armazenamento. A validação de 8 MB protege a incorporação ao domínio; ela ocorre depois do recebimento pelo Storage. Além disso, `calendarEditor` permite emitir e concluir uploads como CAMPUS, embora os consumidores atuais de documentos e restauração exijam ADMIN.

**Impacto:** acúmulo de objetos, armazenamento de conteúdo que a aplicação rejeita e consumo indevido de recursos por uma conta autorizada. Não foi demonstrado acesso a documentos privados de outra conta.

**Correção recomendada:** definir um ingresso com propriedade e rastreabilidade do objeto desde o recebimento, quotas reais e reconciliação de órfãos. Se necessário, substituir o POST direto por um endpoint que controle a leitura e o armazenamento dentro do limite. Restringir a emissão ao papel exigido pelos consumidores atuais ou explicitar os tipos de upload e suas permissões.

Não adicionar simplesmente `storage.delete(storageId)` ao tratamento de erro: o ID vem do cliente, e a conclusão não comprova que ele foi criado por aquele ticket. Essa deficiência também existe no vínculo atual e na limpeza posterior. Tamanho e data de criação são restrições adicionais, não prova de propriedade.

Convex 1.48.0 disponibiliza `storage.store` em mutations. Avaliar um ingresso limitado que transfira os bytes e vincule o objeto numa mutation interna, verificando limites de argumentos, memória e escrita. Armazenar na action e registrar depois em outra mutation exige compensação, idempotência e reconciliação; a simples troca para HTTP não cria atomicidade. Preservar documentos, PDFs com tickets válidos e runtime Chromium. Fechar também os endpoints legados que permitiriam continuar vinculando IDs arbitrários.

## S04 Hash de senhas precisa de atualização de custo

**Local:** `convex/authCrypto.ts:17`.

As senhas são derivadas com scrypt, salt aleatório de 16 bytes e resultado de 64 bytes. O formato persistido é `dentec-scrypt-v1$salt$hash`, dentro de `authAccounts.secret`. A comparação percorre todos os bytes com acumulação de diferenças. Não há senha em texto puro no cadastro de usuários nem criptografia reversível de senha na implementação examinada.

O custo é `N=16384`, `r=8`, `p=1`. A [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt) recomenda atualmente configurações como `N=2^17, r=8, p=1` ou, com a mesma memória de `N=2^14`, `p=5`. A configuração atual está abaixo dessas alternativas.

**Impacto:** menor resistência a tentativas offline caso os hashes vazem por banco, backup ou conta administrativa da plataforma. Isso não significa que alguém consiga recuperar imediatamente qualquer senha ou usar o hash diretamente como senha.

**Correção recomendada:** criar um formato versionado com os parâmetros e um custo calibrado no runtime real. Preservar a leitura de v1 e realizar atualização após autenticação bem-sucedida ou redefinição. Não mudar silenciosamente os parâmetros associados ao prefixo v1, pois isso tornaria as credenciais antigas incompatíveis.

A verificação de senha ocorre numa mutation do runtime Convex. O [limite documentado](https://docs.convex.dev/production/state/limits) de memória é 64 MiB e o tempo de código de usuário por query/mutation é um segundo. `N=2^17,r=8` precisa de aproximadamente 128 MiB só de scrypt e não é uma escolha adequada a copiar para o login atual. Uma alternativa de memória menor, como `N=2^14,r=8,p=5`, deve ser calibrada em CPU e validada sem confundir testes Node com certificação do runtime remoto. Preservar o limitador de senha se a implementação alterar o provider.

O uso do salt hexadecimal como texto foi mantido para compatibilidade legada; não reduz os 128 bits aleatórios gerados. A principal deficiência observada é o custo. Pepper pode ser uma camada adicional, mas exige gestão própria de segredo e não substitui um fator de trabalho adequado.

A política aceita de 10 a 128 caracteres. Recomenda-se bloquear senhas comuns ou comprometidas e reforçar a autenticação de ADMIN. Não é necessário impor regras arbitrárias de símbolos como substituto dessas medidas.

## S05 Dependência Auth.js com avisos conhecidos

**Locais:** `package.json:54`, `pnpm-lock.yaml`, `convex/auth.ts:10`.

`pnpm audit --json` retornou três avisos em `@auth/core@0.41.1`, usado diretamente e como peer de `@convex-dev/auth@0.0.96`. O registro consultado classificou um como crítico, um como alto e um como moderado. Os avisos dos mantenedores indicam correção a partir de `0.41.3`.

| Aviso                                                                                                  | Condição relevante                              | Aplicabilidade observada                                                                                                                 |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [GHSA-7rqj-j65f-68wh](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-7rqj-j65f-68wh) | Normalização de e-mail no fluxo de magic link   | A aplicação configura senha e Google; recuperação automática por e-mail está desabilitada. Caminho vulnerável não identificado em uso    |
| [GHSA-xmf8-cvqr-rfgj](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-xmf8-cvqr-rfgj) | Chamada de `getToken()` sobre Bearer malformado | A aplicação usa validação de identidade Convex; não foi encontrada chamada ao helper vulnerável nos fluxos examinados                    |
| [GHSA-x445-f3h2-j279](https://github.com/nextauthjs/next-auth/security/advisories/GHSA-x445-f3h2-j279) | Confusão entre múltiplos provedores OAuth/OIDC  | Há somente um provedor OAuth configurável, Google; Password não é um segundo provedor OAuth. Exploração entre provedores não demonstrada |

**Correção recomendada:** atualizar para uma versão corrigida compatível e renovar o lockfile, repetindo a auditoria e os testes de senha, Google e sessão. O peer instalado permite `@auth/core ^0.41.1`, mas isso não dispensa a validação de integração. Convex Auth possui implementação própria de partes do fluxo OAuth; atualizar apenas Auth.js não comprova atualização dessas partes incorporadas.

`pnpm check` não inclui `pnpm audit`. Acrescentar revisão periódica de dependências e uma política de tratamento de avisos à operação local de manutenção/release evita que a suíte funcional aprovada seja confundida com ausência de vulnerabilidades conhecidas. Isso pode ser feito sem introduzir CI do GitHub.

## Problemas adicionais incorporados

### R01 Bloqueio dirigido do login por senha

Dez tentativas anônimas incorretas podem esgotar o bucket da conta e recusar a senha correta seguinte, comportamento reproduzido localmente. O padrão repõe dez tentativas por hora, aproximadamente uma a cada seis minutos; não se trata de bloqueio fixo de uma hora. Uma sessão já ativa não é revogada por isso. A conta operacional de smoke também pode ser atingida.

Manter o controle contra força bruta e acrescentar desbloqueio administrativo auditado e operação de contingência. Não remover o limitador, aumentar sua cota indiscriminadamente ou confiar em origem declarada pelo cliente. O desbloqueio e as ações administrativas sensíveis devem exigir uma sessão válida, papel adequado e autenticação recente definida pelo servidor. Documentar a proteção de volume por origem como operação de infraestrutura, sem afirmar que um endpoint de função Convex já fornece o IP.

### R02 Fluxos Google abandonados

Quando Google está habilitado, cada início público de OAuth cria um `authVerifiers`. Quatro chamadas anônimas sintéticas deixaram quatro registros sem sessão e sem expiração própria, sem contato com Google. Incorporar limpeza em lotes com janela compatível com o protocolo, preservando callbacks recentes e sem declarar que a limpeza sozinha impede abuso de volume. Considerar também códigos de verificação expirados e convites/resets vencidos.

### R03 Par incompatível de refresh token

A biblioteca instalada pode apagar a sessão indicada pela metade `sessionId` quando a outra metade não pertence a ela. A prova local combinou token de A com ID de B e encerrou B. É necessário conhecer o ID da vítima; não foi encontrado um vazamento atual nem bypass de login.

Verificar versão corrigida ou aplicar correção mínima versionada da dependência, com regressão do par A/B e de renovação/replay válidos. Não editar `node_modules` sem patch reproduzível no lockfile. Prioridade baixa condicionada, mas a correção pode acompanhar o trabalho da autenticação.

A adoção de um objeto sem vínculo por um upload que conhece seu ID é tratada dentro de S03, sem contar duas vezes a mesma falta de prova de propriedade. Enumeração por timing, expiração reativa e sigilo do `storageId` permanecem hipóteses ou minimização, não requisitos para inventar um problema comprovado.

## Controles que estão bem implementados

### Identidade e autorização

- O cadastro público pelo provider Password é recusado. Contas dependem de administração, convite ou instalação inicial protegida por código.
- `requireNativeUser` confere usuário ativo, sessão existente, associação entre sessão e usuário e expiração. A autorização não depende somente da validade criptográfica do JWT.
- As operações principais de calendário consultam o campus autorizado no backend; adulterar parâmetros da interface não concede outro campus.
- PARECERISTA é impedido de alterar calendários; revisão e administração têm verificações próprias. A listagem de pessoas online exige ADMIN.
- Documentos ainda não publicados são restritos a ADMIN nas consultas e no contexto de download examinados.
- A alteração de papel e a recuperação tentam revogar as sessões anteriores. Esse contrato é adequado, mas precisa da correção S01 para funcionar independentemente do volume.
- Google exige `email_verified`, domínio institucional e conta previamente autorizada. O subject é vinculado e a troca por outro subject é recusada.

### Credenciais temporárias e formulários

- Convites e resets usam tokens aleatórios de 256 bits; o banco guarda SHA-256 do token. Diferentemente de senhas humanas, tokens com essa entropia não precisam de scrypt.
- Convites expiram em 48 horas e resets em 24 horas. A emissão de um novo link invalida o anterior, e o consumo é transacional.
- O fragmento secreto do link é removido com `history.replaceState` antes da criação do Router. O token permanece no fluxo em memória.
- Senhas, códigos, tokens e arquivos ficam fora dos drafts persistidos pelo hook compartilhado. Formulários mistos excluem arquivos; a instrumentação filtra identidades privadas e é desabilitada em produção.
- O destinatário que conhece um convite consegue consultar nome, e-mail e perfil desse convite. Pedir que ele digite novamente o e-mail não é uma prova adicional de posse da caixa postal. A segurança depende da entrega correta e confidencial do link pela administração, como descrito no guia de contas.

### Integridade e conteúdo

- Mutations usam validadores e repetem verificações de papel, versão e estado relevantes. Os modelos de domínio conferem datas, limites de coleções e vínculos importantes no salvamento.
- Snapshots e controle de versão impedem sobrescrita silenciosa por edições concorrentes.
- Os pontos de `dangerouslySetInnerHTML` recebem HTML produzido pelos geradores examinados; campos textuais são escapados. Não foi identificado um caminho explorável de XSS nesses fluxos. Novos campos interpolados precisam conservar esse contrato.
- A importação JSON passa pelo normalizador e pela confirmação de substituição. Não há execução do JSON como código.
- O gerador de PDF usa conteúdo derivado do calendário e bloqueia requisições de rede do contexto Chromium. Os arquivos do runtime são conferidos por SHA-256, tamanho e arquitetura, e a extração rejeita travessia de diretórios e links.

### Implantação e segredos

- Vite publica a SPA; os módulos Node e o backend Convex ficam separados do bundle de navegador. Credenciais administrativas não são necessárias para o cliente.
- Segredos são destinados ao ambiente Convex, sem prefixo `VITE_`. Arquivos locais de ambiente e chaves são ignorados pelo Git.
- A busca por padrões de chave privada, tokens GitHub, segredos Google e IDs AWS nos arquivos rastreados não encontrou credencial real. Os dois marcadores PEM encontrados pertencem à validação de formato em `scripts/dev-setup.ts`. A busca de nomes sensíveis no histórico local encontrou apenas um exemplo antigo `.env.convex.example`, além do exemplo atual.
- Essa busca dirigida não equivale a um scanner completo de entropia e de todos os blobs históricos. Não foram examinados valores secretos nos dashboards ou nos arquivos privados da máquina.
- O backup de migração exige diretório fora do repositório e cria subdiretório privado; contém dados e credenciais. Sua proteção depende também do disco, das cópias e do acesso administrativo ao ambiente de armazenamento.
- O fluxo normal de release executa checagens, controla o destino e registra o progresso. O modo rápido é uma exceção explícita documentada, não deve substituir o tratamento de falhas normais.

## Recomendações de arquitetura e defesa adicional

**Reduzir o alcance de uma sessão ADMIN comprometida.** Geração de links de recuperação, criação de administradores e alteração de papéis não exigem autenticação recente ou segundo fator no código atual. A sessão possui duração máxima configurada de oito horas. Recomenda-se uma verificação recente para essas ações e MFA para administradores. O uso de Google pode aproveitar controles institucionais, mas a aplicação não comprova que a organização os exige; há também acesso local.

**Tratar o armazenamento de sessão como uma escolha de arquitetura.** `web/app/providers.tsx:11` usa o storage padrão de Convex Auth: access token e refresh token ficam em `localStorage`, acessíveis ao JavaScript da origem. Isso é [documentado pelo provedor](https://labs.convex.dev/auth/security#client-secrets-storage), não é armazenamento da senha em texto puro. Uma futura falha de XSS ou de dependência executada na origem pode furtar esses tokens. Preservar a CSP, reduzir tempo de sessão conforme o risco e avaliar storage em memória ou por aba. Uma camada de servidor com cookies HttpOnly para refresh pode oferecer outra proteção, mas exige mudança arquitetural; trocar simplesmente o storage por cookies acessíveis ao JavaScript não resolve.

**Conservar a fronteira de autorização explícita.** A separação `web/`, domínio puro em `src/` e backend em `convex/` facilita a revisão. Os helpers de identidade, papel e campus concentram invariantes úteis. Para novas funções, usar convenções ou wrappers que tornem a autorização obrigatória por padrão, preservando as exceções públicas deliberadas. As actions devem verificar acesso antes de processamento caro e repetir as verificações necessárias na gravação. S02 mostra como uma convenção em comentário pode divergir da implementação.

**Restringir conexões da CSP aos deployments necessários.** A política atual aceita toda a família `*.convex.cloud` e `*.convex.site`. Especificar as origens do ambiente reduz destinos de exfiltração possíveis se surgir uma execução de script indevida. É defesa adicional; não foi demonstrado bypass da política de scripts. `form-action 'self'` e uma `Permissions-Policy` mínima também podem reduzir superfícies desnecessárias, após validar os fluxos reais.

**Manter downloads temporários como uma decisão consciente.** Os tickets têm 256 bits, hash no banco, validade de um minuto, `no-store` e `Content-Disposition: attachment`. Eles são capacidades bearer: qualquer pessoa que possua o link pode usá-lo durante esse minuto. Não possuem proprietário/sessão no registro e não são consumidos no primeiro GET. Uma prova local confirmou que um ticket emitido continua resolvendo após a remoção do usuário, até expirar. Para os documentos institucionais isso pode ser uma escolha aceitável; para conteúdo sigiloso, vincular o download à identidade e à revogação, ou implementar consumo único quando o fluxo permitir. CORS não impede o uso direto de um link conhecido.

**Minimizar o ambiente e as capacidades do Chromium.** `src/native-pdf.ts:31` transmite `process.env` ao subprocesso e usa os argumentos serverless do pacote. Não foi demonstrada execução de código arbitrário ou fuga do renderizador. Como os templates não precisam de JavaScript, avaliar `javaScriptEnabled: false`, uma allowlist de variáveis de ambiente e limites de concorrência/tempo para geração. Preservar o bloqueio de rede existente. Qualquer implementação deve passar pelo teste Linux do runtime.

**Complementar auditoria de negócio com detecção de incidentes.** Criação, remoção, alteração de perfil e recuperação produzem registros de auditoria. Não foi encontrada uma implementação própria de alertas para falhas de autenticação, picos de resets ou uploads, nem expiração rotineira dos registros de convites e resets. Definir métricas, alertas, retenção e um procedimento de contenção que inclua contas das plataformas, sessões e chaves. Não registrar senhas ou tokens para obter observabilidade; manter a opção de exposição de segredos do provedor desabilitada.

**Verificar as plataformas e a recuperação operacional.** MFA, membros e permissões dos projetos Convex/Vercel/GitHub, proteção de branch, escopo dos tokens, criptografia e retenção dos backups e ensaio de restauração precisam de conferência administrativa separada. Não são propriedades comprováveis somente pela árvore de código. URLs de deployment e a chave pública JWKS não devem ser tratadas como segredos.

## Verificações executadas

- `pnpm exec intent list`: descoberta local disponível; não foi necessário instalar ferramentas ou substituir dependências.
- `pnpm audit --json`: três avisos em Auth.js, detalhados em S05; comando terminou com código 1 por esses avisos.
- `pnpm test:unit`: 77 arquivos e 444 testes aprovados.
- `pnpm check`: aprovado, incluindo formatação, lint, análise de tipos, checagem de skills, os 444 testes unitários, 226 testes de navegador e build. O relatório Playwright registrou zero falhas, zero testes instáveis e zero pulados, com duração de aproximadamente 2 minutos e 40 segundos para o navegador; inclui as comparações desktop e mobile do macOS. O build emitiu avisos de diretivas `use client` de dependências durante o empacotamento, sem impedir a conclusão.
- Duas suítes temporárias de auditoria: quatro testes aprovados, cobrindo S01, S02, S03 e a capacidade bearer de download. A primeira execução da prova de upload precisou corrigir o retorno de um `Blob` pela fixture para um booleano serializável; a execução corrigida comprovou o comportamento. Os arquivos temporários foram removidos após a inspeção.
- `HEAD` na raiz do portal público: resposta 200, com CSP, HSTS de 63.072.000 segundos, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin` e revalidação do HTML. `Permissions-Policy` ausente. A consulta não autenticou usuário nem alterou dados.
- Busca dirigida de segredos nos arquivos rastreados e de nomes sensíveis no histórico local, com resultados descritos acima.

Os testes existentes aprovados não detectavam os casos adversos novos; aprovação funcional não elimina os achados desta análise. A formatação do relatório foi conferida separadamente com `pnpm exec prettier --check docs/analise-seguranca-2026-10-28.md`.

## Limites e sequência de correção

Esta é uma revisão de código e configuração com provas locais selecionadas. Não certifica ausência de outras vulnerabilidades. Não houve exploração autenticada remota, carga, análise de isolamento interno dos fornecedores ou inspeção de segredos e controles administrativos dos dashboards. A leitura dos headers públicos não comprova que o backend publicado corresponde integralmente ao commit local.

O E2E remoto não foi executado porque exige opt-in específico para desenvolvimento ou deployment descartável. O teste Linux de PDF não foi executado nesta revisão, que preservou o gerador, o modelo e as dependências do runtime.

## Plano incorporado para implementação

Este é o escopo executável desta entrega. As referências a resultados anteriores descrevem a investigação; o implementador deve registrar separadamente o que mudou, os testes novos e as pendências reais.

**Estado da implementação:** os oito itens foram implementados localmente por subagente. O [code review posterior](revisao-implementacao-seguranca-2026-10-28.md) registra os achados da implementação, suas correções e a validação final. O [guia operacional](seguranca-operacional.md) descreve o comportamento implementado e os ensaios remotos necessários antes de publicar. As seções anteriores preservam a análise do estado original.

1. **S01 — invalidação imediata e limpeza limitada.** Desativação, troca de papel/campus e reset não podem falhar pelo número de sessões/tokens. Sessões antigas perdem acesso imediatamente, inclusive na emissão/renovação de JWT. Limpeza em lotes com continuidade, orçamento limitado e corte estável; preservar logins novos. Regressões: 1.001 sessões, 1.001 refresh tokens por cadeia pública, mais de 4.000 tokens, sessões expiradas, novo login após reset e transações concorrentes.
2. **S02 — caminhos públicos baratos e cotas persistentes.** Conferir token e identidade antes do hash; manter validação/consumo final transacionais e a manutenção. Rejeições não devem abrir leases inúteis nem apagar a contabilização da tentativa. Limitar trabalho caro por capacidade válida e concorrência, usando o componente recomendado quando houver quota, sem confiar em IP de argumento. Regressões: token inválido não chama hash nem cria lease, token expirado/usado recusado, corrida de consumo e cota preservada após rejeição.
3. **S03 — ingresso de arquivos com propriedade comprovada.** Permitir upload somente aos papéis dos consumidores atuais; o servidor deve controlar limite real de bytes, assinatura e vínculo com usuário/ticket. Não aceitar um `storageId` arbitrário como prova de envio. Fechar o caminho legado inseguro sem apagar conteúdo legítimo. Preservar consumo único, restauração por SHA-256 e o tratamento de falha/expiração; provar que arquivo rejeitado não fica persistido. Regressões com assinatura/tamanho inválidos, objeto alheio conhecido, usuário errado, consumo repetido, restauração e limpeza.
4. **R01 — desbloqueio auditado e autenticação recente.** Acrescentar operação ADMIN controlada de desbloqueio da conta, sem retirar o bucket de falhas. Definir recência com horário/identidade da sessão validados no servidor, não com dados do cliente nem com um JWT recém-renovado. Aplicar a proteção às operações administrativas sensíveis, com recuperação previsível na interface quando necessário. Preservar o smoke de release e incluir testes negativos e de auditoria. Alertas e proteção de origem devem ser descritos com seu alcance real.
5. **R02 — higiene de autenticação.** Limpar verificadores OAuth antigos, códigos expirados, convites/resets vencidos e sessões expiradas em lotes limitados, preservando fluxos atuais e manutenção. Não adicionar uma varredura integral sem orçamento ou um cron que altere dados acadêmicos.
6. **S05 e R03 — dependências reproduzíveis.** Atualizar Auth.js para versão corrigida compatível e repetir a auditoria. Verificar o problema de par incompatível em Convex Auth e corrigir via versão compatível ou patch mínimo versionado, sem perder os controles OAuth e de replay. Não introduzir troca completa de provedor sem necessidade.
7. **S04 — hash v2 compatível e limitado.** Implementar formato versionado, leitura de v1, custo novo dentro do orçamento de memória, testes e medição local de criação/verificação. Preservar senhas antigas e o limitador de login; migrar com escrita segura quando aplicável. A medição real do runtime permanece requisito antes de uma futura publicação, com opt-in próprio; não aumentar para 128 MiB nem apresentar o teste local como essa medição.
8. **Documentação e regressões.** Atualizar os guias de contas, arquitetura e verificação para o comportamento final e as rotinas de operação. Manter explícitas as dependências de configuração administrativa ou de integração real. Não elevar hipóteses condicionadas a exploração comprovada.

A implementação local não inclui deploy, E2E remoto, configuração de contas das plataformas, contato com fornecedores ou publicação de vulnerabilidades. MFA institucional, migração para cookies HttpOnly e endurecimento do subprocesso PDF permanecem recomendações de arquitetura/operação separadas; não são pré-condições para corrigir as falhas demonstradas e não justificam introduzir uma troca ampla de stack nesta entrega.

Depois da implementação por subagente, o responsável principal fará code review contra este plano e contra os padrões do repositório, tratando achados antes da entrega. Rodar primeiro as suítes pertinentes; concluir com `pnpm check` sobre o código final, formatação dos documentos alterados e `pnpm audit`. Se o gerador, modelo ou dependências do runtime PDF forem afetados, rodar também `pnpm test:runtime:linux`. Verificações remotas não autorizadas ficam pendentes com causa explícita e não contam como aprovação.
