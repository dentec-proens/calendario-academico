# Execução das observâncias de 2027

Status: concluído em produção em 30/10/2026, com manutenção encerrada.

## Resultado

O Dia do Servidor Público pode ser observado somente em 28 ou 29/10/2027.
O Dia do Professor conserva as opções de 11 a 17/10/2027, inclusive fim de
semana. As regras são declaradas na policy anual e as escolhas são salvas
por calendário em `observanceDates`.

A aplicação usa formulário e mecanismo compartilhados, informa conflitos
e preserva a referência institucional e os snapshots históricos. Os
recessos de 29/10 e 01/11 e Finados em 02/11 foram mantidos.

## Publicações e manutenção

- Expansão e migrações: `1d8aa838f21d8ad5a368638bd9cf09387faeaedd`.
- Contração e código final: `cc08ec69eac947c9374912ef2fc3eebf1622e305`.
- Deployment final Vercel: `dpl_FeZHFb14fTfCqzJZ9jQZiVTmDwdq`.
- Convex: `exuberant-cheetah-138`.
- Portal: [Calendário Acadêmico](https://calendario-academico-phi.vercel.app).
- Janela confirmada: 30/10/2026 11:56:59 a
  12:04:54 (America/Sao_Paulo),
  aproximadamente 475 segundos.

As duas publicações usaram `pnpm deploy:production --maintenance` com o
mesmo SHA responsável pela janela. O acesso permaneceu bloqueado entre a
expansão e a contração. Ao final, `operations:status` confirmou manutenção
desativada, ausência de bloqueio emergencial e nenhuma operação pendente.
A reserva Git das releases foi liberada.

## Dados e verificações

Foram processados 39 conteúdos atuais e 109 snapshots históricos. A
conversão efetiva atingiu dois conteúdos e dois snapshots: o valor de
`teacherDayDate` passou para `observanceDates['teacher-day']`. A migração
não criou escolhas do Servidor nem recalculou calendários ou históricos.

A comparação independente conferiu 64 tabelas/namespaces e os bytes do
Storage. IDs, versões, datas de atualização, vínculos, ofertas, eventos e
conteúdo acadêmico foram preservados. Os únicos registros novos da migração
foram seus dois recibos no componente. O arquivo de Storage foi preservado.

A conferência distinguiu os ciclos automáticos que continuam ativos durante
manutenção: prazos e sessões de presença e o agendamento de seu worker,
validados pelo reconciliador delimitado e pelos hashes dos componentes
instalados; e dois refresh tokens novos, ligados à mesma cadeia e às sessões
Auth e identidades já existentes, com uma marca de primeiro uso atualizada.
Os 33 refresh tokens anteriores foram mantidos. Essas transições foram
verificadas separadamente e não foram tratadas como igualdade literal.

O schema final foi aceito pelo Convex. Os contratos publicados não contêm
`teacherDayDate`, as definições temporárias foram retiradas e não há
migrações pendentes. O domínio público foi conferido contra o commit e o
deployment finais, com respostas válidas para o portal e `version.json`.

## Validação de desenvolvimento

- Expansão: `pnpm check` aprovado em 243,4 s, com 335 testes de navegador.
- Contração: `pnpm check` aprovado em checkout isolado em 243,0 s, também
  com 335 testes de navegador.
- As verificações incluem tipos, lint, build, domínio, Convex, interface em
  desktop/mobile, teclado, foco, rascunhos e impressão no Chromium.
- Referências visuais das alterações intencionais foram inspecionadas,
  atualizadas e comparadas novamente sem atualização no `check`.
- O backup integral foi restaurado em backend local isolado, com todas as
  tabelas e Storage equivalentes antes do ensaio.
- O ensaio conferiu os 148 estados: 97 contagens equivalentes entre o código
  anterior e o novo e 51 estados incompletos com a mesma validação.
- A contração foi ensaiada no backend isolado, incluindo a rejeição do campo
  antigo em conteúdos e snapshots. Nenhuma suíte E2E foi executada contra
  dados de produção.

## Backup e evidências

Backup integral com Storage imediatamente anterior ao backend da expansão:

```text
/Users/gustavo/work/backups-calendario/release-1d8aa838-IOYuqc/before.zip
SHA-256: f67d8f3f88743a225b85effaab68a39e0e9c1b85f01b70c88cb902058afb8b40
```

Evidências privadas, inventário, ensaio, exportações, metadados e logs:
`/Users/gustavo/work/operacao-observancias-20261030/`.

Os executores e testes temporários da conversão permanecem no histórico do
commit de expansão. Não reaplicar migrações antigas ou restaurar backups
sobre dados posteriores sem preparar uma operação própria.

## Trabalho paralelo

As publicações foram feitas em uma cópia isolada dos commits validados,
porque o checkout principal recebeu alterações de outro trabalho durante
a execução. Essas alterações foram preservadas e não foram incluídas
nestas publicações. O commit servido é o da contração indicado acima;
commits posteriores de documentação não mudam o código publicado.
