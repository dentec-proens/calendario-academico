# Operações administrativas de dados

A ferramenta `scripts/migrate-data.ts` opera sobre exportações Convex mediante plano, fingerprints, ensaio e recibos. Ela é administrativa e não participa do runtime do navegador nem das funções de negócio.

## Requisitos

- Destino explicitamente identificado e backup integral com Storage.
- Diretório privado fora do Git para ZIPs, planos, recibos e logs.
- Ensaio descartável isolado antes de qualquer aplicação em ambiente compartilhado.
- Verificação de IDs, sessões, referências, versões, pareceres, componentes e arquivos.

Exportações podem conter credenciais e dados pessoais. Não publicar seus conteúdos em logs ou artefatos de CI. Novos conteúdos e cópias de calendário usam `schemaVersion: 3`; v2 permanece como formato de leitura/conversão, inclusive para os adaptadores históricos desta migração. As regras de validação e normalização pertencem ao código de domínio e ao schema.

## Conversão local de v2 para v3

A consulta preserva o conteúdo e os snapshots originais. O editor adapta v2 em memória; um salvamento válido grava v3 com a versão esperada e a incorporação explícita da política de 2027 quando necessária. A importação de cópia usa a mesma conversão e pede confirmação antes da substituição do estado aplicado. Dois salvamentos concorrentes não executam duas conversões silenciosas.

Organização anual inequívoca conserva período, ID e datas. Organização semestral exige identidade segura dos dois semestres; nomes genéricos, `misto` e configurações inconsistentes ficam `a-classificar`. A classificação não é inferida pela posição de um período em uma lista. Nenhum edital legado ganha ano de ingresso ou situação realizada pelo nome. A configuração geral antiga de ingresso é contexto; em calendário combinado, exige confirmação por oferta.

Um cliente v2 não sobrescreve conteúdo já convertido para v3. Cópias, fontes e rascunhos continuam recuperáveis para atualização do cliente. Pareceres e snapshots antigos não são reescritos; a adoção de novas regras invalida a conferência antiga, e a nova revisão identifica o conjunto efetivamente examinado. O ensaio da fonte institucional e a operação administrativa posterior estão descritos em [Arquitetura](arquitetura-convex.md#conteúdo-v3-e-política-de-2027).

## Fluxo da ferramenta

```sh
pnpm migrate:data plan --snapshot backup-dados/original.zip --out backup-dados/plan.json
pnpm migrate:data prepare --plan backup-dados/plan.json --out backup-dados/rehearsal
```

`plan` produz o digest, fingerprints e lotes; `prepare` constrói o projeto isolado de execução. Planos vazios representam conferência e não devem iniciar uma aplicação.

Depois de restaurar o ZIP integral em um backend descartável e conferir sua identidade, aplicar com digest explícito e verificar o próprio destino:

```sh
pnpm migrate:data apply --plan backup-dados/plan.json --deployment local --project backup-dados/rehearsal --confirm DIGEST_DO_PLANO
pnpm migrate:data verify --plan backup-dados/plan.json --snapshot backup-dados/after.zip --deployment local --project backup-dados/rehearsal --out backup-dados/receipt.json
pnpm migrate:data finish --plan backup-dados/plan.json --deployment local --project backup-dados/rehearsal --receipt backup-dados/receipt.json
```

As identidades `local`, portas e credenciais pertencem ao ambiente descartável preparado. Não inferir que um destino é descartável por seu nome. `apply` confere a fonte novamente; qualquer divergência exige plano e ensaio próprios. Produção exige o recibo verificado correspondente ao plano e ao schema em outro deployment, além da conferência explícita do destino.

## Verificação e recuperação

Conferir conteúdo, contagem, referências, snapshots, análises, texto dos pareceres, Storage e namespaces de componentes. Preservar o ZIP sem edição manual. Uma falha de fingerprint, arquivo, schema ou referência bloqueia a reabertura; não remover registros ou relaxar validações para aprovar o plano.

A publicação de código não executa a ferramenta nem importa dados. A recuperação integral usa dados e código correspondentes; dados produzidos após a reabertura exigem conciliação antes de restaurar um backup. Manter recibos e evidências em local privado.

Comandos de desenvolvimento e validação ficam em [Verificação](verificacao.md); os controles de manutenção e publicação ficam em [Implantação e operação](implantacao-convex-vercel.md).
