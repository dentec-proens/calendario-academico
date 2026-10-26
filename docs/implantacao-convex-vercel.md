# Implantação e operação

## Destinos e configuração

Os identificadores públicos ficam em [`config/environments.ts`](../config/environments.ts). Cada desenvolvedor usa sua conta e deployment individual. Produção usa o Convex `exuberant-cheetah-138` e o portal [calendario-academico-phi.vercel.app](https://calendario-academico-phi.vercel.app), no projeto Vercel `dentec-proens/calendario-academico`. O repositório é `dentec-proens/calendario-academico`, branch de publicação `main`.

O desenvolvimento usa `.env.local`, preparado por `pnpm dev:setup`. Na Vercel, Production usa:

```dotenv
VITE_CONVEX_URL=https://exuberant-cheetah-138.convex.cloud
VITE_CONVEX_SITE_URL=https://exuberant-cheetah-138.convex.site
```

`SITE_URL`, `JWT_PRIVATE_KEY`, `JWKS` e credenciais dos provedores pertencem ao ambiente Convex. Nunca use prefixo `VITE_` em segredo. Cada ambiente tem configuração de autenticação própria.

Vite gera `dist/app/index.html` e chunks. Vite, preview e Vercel encaminham somente os caminhos conhecidos do produto para essa entrada. `vercel.json` mantém headers de segurança, instalação com lockfile e build Node 24. O build Production confere as URLs Convex contra o destino versionado.

## Publicação coordenada

Pré-requisitos:

- `main` commitada, sem alterações ou arquivos novos, e `origin` apontando ao repositório configurado.
- Acesso administrativo ao deployment Convex de produção e permissão de push fast-forward.
- `VERCEL_TOKEN` no ambiente do processo, com acesso ao projeto e team configurados. Não inserir o token em argumentos, logs, Git ou arquivos de configuração públicos.
- Controle `operations:pause`, `operations:status` e `operations:resume` instalado no destino, com admissão de mutations/actions instrumentada. Um endpoint inexistente interrompe a publicação antes da troca de contratos; a instalação desse controle requer uma preparação operacional própria no destino conferido.
- Conta operacional ADMIN com senha local e calendário de teste próprios, identificados no processo por `DENTEC_RELEASE_SMOKE_USER_ID`, `DENTEC_RELEASE_SMOKE_EMAIL`, `DENTEC_RELEASE_SMOKE_PASSWORD` e `DENTEC_RELEASE_SMOKE_CALENDAR_ID`. As credenciais não entram no Git. O calendário deve estar salvo com a base institucional vigente.
- Chromium local instalado com `pnpm test:browser:install`, inclusive no Windows. O smoke usa esse navegador para acessar o portal publicado e o PDF processado pelo Convex.

O preflight consulta `operations:status`, recusa o bloqueio emergencial, confere a identidade ADMIN local e o calendário operacional, inicia/encerra o Chromium e inventaria os jobs antes de pausar ou substituir funções. O inventário autoritativo é repetido depois da drenagem, em páginas de até 100 registros, sem teto baseado no volume de jobs concluídos. Para conferir o protocolo e os leases no destino explícito:

```sh
pnpm exec convex run operations:status '{}' --deployment exuberant-cheetah-138 --codegen disable
pnpm exec convex data operationalControl --limit 10 --format json --deployment exuberant-cheetah-138
pnpm exec convex data operationalLeases --limit 1001 --format json --deployment exuberant-cheetah-138
pnpm exec convex run operations:scheduledPage '{"paginationOpts":{"numItems":100,"cursor":null}}' --deployment exuberant-cheetah-138 --codegen disable
```

Um destino sem esse protocolo não está preparado para o corte. Sua preparação exige instalar a barreira de admissão conservando os contratos em uso e comprovar a conclusão das actions aceitas antes da instrumentação. Não publicar a aplicação reorganizada para instalar o próprio preflight. Sem evidência completa de drenagem, a publicação permanece bloqueada. A pausa nativa do Convex e seus gráficos de máximos de concorrência não substituem essa evidência: valores ausentes e tempo decorrido não demonstram que uma action terminou. A preparação inicial da barreira é uma pendência operacional separada da execução deste comando.

Confira o procedimento sem chamadas remotas:

```sh
pnpm deploy:production --dry-run
```

Para publicar:

```sh
pnpm deploy:production
```

O comando confere branch, repositório, destino e atualização, executa `pnpm check`, confere o protocolo operacional, entra em manutenção e aguarda a conclusão das actions aceitas. Inventaria as funções agendadas; trabalhos em execução, inventário incompleto ou referências pendentes sem identidade preservada interrompem o corte. Publica as funções Convex, prepara os recursos PDF, envia o SHA conferido ao GitHub e aguarda o deployment Vercel desse commit. Confere que o domínio de produção aponta ao mesmo deployment Ready e verifica seu acesso HTML.

Antes de liberar operações, autoriza somente a conta operacional na janela do commit e executa login no portal, acesso direto ao editor e à visualização, consulta autenticada, mutation de salvamento sem alteração e download de PDF real. O salvamento usa `unchangedOnly`: qualquer diferença de estado ou de base interrompe o smoke antes de gravar, sem criar versão. O PDF e as sessões são recursos operacionais temporários; nenhum calendário definitivo é alterado. A permissão restrita é removida ao concluir ou falhar o smoke. Somente após o smoke e a conferência final dos leases o comando libera o acesso geral.

O push não confirma frontend disponível. Build isolado Vercel não publica Convex. Não enviar `main` por outro caminho para contornar a coordenação de contratos. As abas abertas precisam recarregar o código antes de continuar.

Se `origin/main` já contiver exatamente o commit local, o comando exige uma janela pausada pertencente ao mesmo SHA para caracterizar uma repetição. Um commit já publicado sem essa janela exige conferir a correspondência dos artefatos antes de continuar; o comando não presume que a coordenação aconteceu.

A confirmação de deployment pela API Vercel e o acesso HTTP não bastam para liberar a manutenção. O smoke autenticado descrito acima faz parte do comando. A suíte E2E completa continua restrita ao destino descartável ou ao desenvolvimento autorizado, conforme o README; não executa em produção.

## Falhas e manutenção

A manutenção é confirmada no backend. `operationalControl` identifica o commit responsável, e `operationalLeases` mostra actions aceitas que ainda não concluíram. A configuração emergencial `DENTEC_MAINTENANCE=1` também bloqueia novas alterações. Não considerar o tempo decorrido como término de uma action.

Uma falha após a pausa mantém o bloqueio. Uma resposta perdida da CLI pode ocorrer após o commit da pausa ou da autorização de smoke; conferir o estado também nesses casos. A revogação do smoke é tentada mesmo quando sua autorização não teve resposta, e uma falha de limpeza preserva o diagnóstico original. Conferir o estado pelo destino explícito, por exemplo:

```sh
pnpm exec convex run operations:status '{}' --deployment exuberant-cheetah-138 --codegen disable
```

Antes de liberar, conferir o commit que possui a janela, as operações ativas, os contratos Convex, o deployment Ready e o domínio Vercel. Uma falha de conexão durante publicação pode ocorrer após o envio; consultar o destino antes de repetir. Se uma action foi interrompida sem liberar o lease, comprovar sua conclusão na plataforma e tratar o lease por procedimento administrativo revisado. Não apagar leases automaticamente por idade.

Cada action registra `Operational lease`, o ID do lease e sua operação no próprio log de execução. Para um lease pendente, localizar esse registro e conferir o evento terminal da mesma execução no Convex. Somente após comprovar o término, a função interna `operations:finish` pode receber o ID exato desse lease. Sem evento terminal ou prova da plataforma, manter o bloqueio e investigar; não inferir que a action terminou por ter ultrapassado uma duração esperada.

Se a falha aconteceu antes de qualquer tentativa de deploy, os contratos não foram substituídos. Depois de confirmar `operations:status` sem leases ativos e a janela do mesmo commit, `operations:resume` com esse commit reabre o acesso. Se houve tentativa de deploy com resultado incerto, conferir os dois artefatos antes de liberar.

Uma mudança de regras pode fazer o calendário operacional deixar de ser um no-op mesmo após um preflight válido. O smoke recusa gravar essa diferença. Para corrigir o registro, manter a janela pausada, usar `operations:authorizeSmoke` com o commit e o ID da conta operacional, entrar no portal com essa conta, conferir e salvar explicitamente o calendário de teste e executar `operations:endSmoke` com o mesmo commit. Repetir a publicação desse SHA somente após essa conferência. A ferramenta não altera automaticamente calendários para obter aprovação do smoke.

O inventário da aplicação preserva os callbacks de `nativeFiles`. O componente de presença mantém sua versão fixada e seu ciclo próprio: heartbeat e disconnect continuam disponíveis durante manutenção e não alteram calendários, documentos ou acessos. Uma atualização desse componente exige conferir também seus jobs com `convex data _scheduled_functions --component presence` e `--component presence/batchWorker`, além de seu contrato de atualização; não está coberta por presumir que o inventário da aplicação inclui componentes.

A recuperação usa backend e frontend da mesma revisão e mantém IDs e dados. Importar backup exige análise específica: dados criados após a reabertura não podem ser descartados por um rollback automático. Depois de um período de manutenção, a função interna `nativeFiles:cleanupExpired` remove temporários vencidos em lotes e preserva arquivos consumidos.

## Backup e arquivos

Exportar Convex completo com `--include-file-storage` quando houver PDFs. Manter ZIP, recibos e credenciais em local privado, fora do Git. Ensaiar restauração integral em um deployment descartável antes de operar sobre dados compartilhados; importação isolada de tabelas pode quebrar referências.

A aplicação repõe um PDF indisponível pelo fluxo [Restaurar original](restauracao-de-originais.md), com conferência de hash. Operações sobre exportações usam a [ferramenta administrativa de dados](migracao-schema.md).

Os testes remotos exigem opt-in de deployment descartável ou do desenvolvimento atual autorizado, com destino verificado e registros exclusivos da suíte conforme a [Verificação no README](../README.md#verificação). Produção não recebe E2E. A execução Windows precisa de evidência efetiva do CI; resultados macOS/Linux não comprovam esse ambiente.

## Recursos operacionais de PDF

A publicação prepara automaticamente recursos gzip das duas arquiteturas do Chromium fixado. A etapa usa os arquivos x64 da dependência verificada pelo lockfile e o pacote oficial ARM64 com SHA-256 fixado, converte no host e envia ao Convex Storage por funções internas. A configuração `DENTEC_CHROMIUM_RUNTIME` só é gravada após os uploads; a conferência exige os mesmos tamanhos e hashes dos metadados do Storage.

A preparação ocorre após o deploy do backend e antes do push do frontend. Se falhar, a manutenção permanece ativa. Não libere o acesso enquanto o runtime não estiver confirmado. O comando requer rede para o GitHub e upload de arquivos ao Storage; não usa os fluxos de documentos institucionais. Recursos já conferidos são reutilizados. As actions baixam os recursos por URLs obtidas diretamente do Storage e verificam integridade e arquitetura antes da extração gzip; não executam descompressão Brotli.
