# Operações administrativas de dados

Este guia vale para as operações de **nível 2** descritas em [Implantação e operação](implantacao-convex-vercel.md#níveis-de-risco): exclusões, reescritas entre tabelas, mudanças de significado de um dado e alterações em auth, sessões ou Storage. Mudanças aditivas e conversões de nível 1 seguem só a release comum.

## Requisitos

- Destino explicitamente identificado e backup integral com Storage.
- Diretório privado fora do Git para ZIPs, planos, recibos e logs.
- Ensaio num deployment descartável restaurado do backup antes de qualquer aplicação em ambiente compartilhado.
- Conferência das exportações antes e depois: IDs, referências, versões, pareceres, componentes e arquivos.

Exportações podem conter credenciais e dados pessoais. Não publicar seus conteúdos em logs ou artefatos de CI.

## Ferramentas

`scripts/administration/` reúne o que é reutilizável entre operações, fora do runtime do navegador e das funções de negócio:

- `snapshot.ts` lê uma exportação Convex (ZIP), com tabelas, componentes e Storage.
- `canonical.ts` serializa e calcula fingerprints estáveis para comparar estados.
- `presence-lifecycle.ts` e `presence-runtime.ts` reconciliam o ciclo normal do componente de presença, que muda entre duas exportações sem relação com a operação.
- `cli-environment.ts` executa a CLI do Convex contra um destino isolado.

Uma conferência específica de uma operação (projeções, inventários, executores temporários) é escrita para ela e retirada do código ao final. O que foi usado permanece no histórico do Git.

## Dados efêmeros

A comparação de exportações precisa separar a mudança da operação do que muda sozinho:

- A autenticação continua renovando credenciais de sessões existentes durante a manutenção. Essas renovações são esperadas.
- O ciclo de presença é conferido somente nas tabelas e campos inventariados da versão instalada, preservando identidades e dados estáveis.
- Tickets e PDFs efêmeros podem expirar durante a manutenção. Concluir seu ciclo normal antes do backup evita confundi-lo com mudanças da operação. Os demais arquivos continuam sujeitos à comparação estrita.

Uma divergência não coberta por uma prova explícita exige investigação, sem alterar os hashes de um plano já ensaiado.

## Verificação e recuperação

Uma falha de fingerprint, arquivo, schema ou referência bloqueia a reabertura. Não remover registros nem relaxar validações para aprovar o plano. Preservar o ZIP sem edição manual.

A recuperação integral usa dados e código correspondentes. Dados produzidos após a reabertura exigem conciliação antes de restaurar um backup.

Recibos, contagens e backups de uma operação concluída ficam na pasta privada da operação e na mensagem do commit que a publica, não nesta documentação. Não reaplicar planos ou executores de uma operação já concluída.

## Formatos antigos que permanecem nos dados

O armazenamento aceita somente o formato 4 de calendário, inclusive em snapshots históricos. Alguns valores antigos continuam válidos nesse formato:

- `legacyStageCount` representa a quantidade conhecida de etapas de uma oferta com organização pendente. Ele sai do conteúdo atual quando a oferta é configurada e permanece nas versões arquivadas.
- A política de 2027 conserva como vínculos legados opcionais os IDs de requisitos da lista operacional anterior.
- Os snapshots institucionais conservam tipos normativos em `modalities`. O escopo é resolvido por `offer.kind`, sem reintroduzir esse campo nos eventos locais.
