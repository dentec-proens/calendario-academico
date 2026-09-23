# Entrega v03

## Implementado

- Cadastro inicial dos 25 campi da imagem fornecida, mais Foz do Iguaçu, incluído expressamente pela solicitante. ADMIN pode acrescentar unidades, incluindo campi avançados e centros de referência.
- Contas locais ADMIN e CAMPUS, com autorização efetiva no servidor. Conta CAMPUS pertence a uma unidade e não consulta calendários ou PDFs de outra.
- Nove feriados nacionais fixos de 2027 pré-cadastrados com fontes legais. Não se presume calendário nacional completo para outros anos.
- Recessos, datas comemorativas, prazos e impedimentos da resolução 2027 SEI 4354987 pré-cadastrados. Paixão de Cristo é registrada como impedimento da resolução, sem generalizar a classificação legal de feriado nacional. Carnaval e Corpus Christi não são cadastrados como feriados nacionais genéricos.
- ADMIN inclui/edita/desativa eventos na base compartilhada, com data, fonte, efeito e ofertas. A alteração recebe revisão; calendários incorporam a revisão ao serem reabertos. Salvamento concorrente ou com base desatualizada retorna conflito.
- Calendários separados por campus e oferta: técnico integrado, técnico subsequente ou graduação. Cursos, turmas e turnos aparecem na identificação. Cursos de um mesmo registro compartilham o calendário e os cálculos; organizações distintas exigem registros distintos nesta versão.
- Salvamento persistente com versões anteriores preservadas no arquivo de dados; a interface ainda não oferece restauração ou comparação dessas versões.
- PDF histórico de até 8 MB vinculado ao campus, calendário, oferta e ano anterior. Registro de observações e hash do arquivo, download autorizado. O ano informado representa declaração do envio, não uma conclusão automática sobre o conteúdo do PDF.
- Calendário gerado na estrutura de meses com grade à esquerda, datas/eventos à direita, identificação, legenda e totais. Impressão pelo navegador; grade derivada dos mesmos dados do motor.

## Fontes e decisões

Modelo gráfico inspecionado nas duas páginas de `_1._Calendario_Academico_de_Referencia_PROENS___Calendario_2026 (1).pdf`, hash SHA-256 05cc8501a319f78b84b9f3e33c54a37deb4d146602a795db572b4f2e0f2c7869. A estrutura foi adaptada para HTML/impressão; paginação, cores e representação textual da identificação não constituem reprodução gráfica exata. Não se copiou a frase de aprovação com número fictício do modelo.

O arquivo equivalente com nome acentuado também se refere a 2026. Ambos são referências de apresentação; suas datas não foram transportadas para 2027. O calendário aprovado de 2026 e os documentos de Ponta Grossa são referências históricas, não pacotes normativos de 2027. O descritivo de Ponta Grossa mistura referências a 2025 e datas de 2026, reforçando a necessidade de conferir ano e origem antes de importar regras.

`Documentos_02_a_10_Gerador_Calendario_IFPR.pdf` tem 154 páginas e `Documentos_02_a_09_Gerador_Calendario_IFPR.pdf` tem 176. Foram extraídos e consultados os trechos relevantes de cadastro, perfis, documentos e saída gráfica. Esses documentos são especificações de projeto e não substituem a norma vigente. Não se alega que todos os seus requisitos estejam implementados ou que constituam o parecer oficial completo.

O arquivo “Calendário Oficial” de feriados de Foz foi gerado pelo site comercial feriados.com.br. Ele aponta 10/06 e 24/06 e datas religiosas, mas não foi utilizado como confirmação oficial municipal. Nenhum desses feriados foi propagado a outros campi ou incorporado automaticamente. O campo de eventos locais aceita sua inclusão após conferência pelo campus.

A lista nacional fixa foi verificada nas fontes primárias:

- Lei 662/1949 em sua redação vigente: https://www.planalto.gov.br/ccivil_03/leis/l0662.htm
- Lei 6.802/1980: https://www.planalto.gov.br/ccivil_03/leis/l6802.htm
- Lei 14.759/2023: https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm

A aprovação da resolução 2027 foi confirmada pela solicitante. Seu nome original com “minuta” não invalida esse registro. Os eventos centrais aplicam o texto lido do SEI 4354987, sem inventar número final da resolução ou publicação.

## Limites e próxima implementação

Esta é uma instalação local, não uma implantação institucional. As contas compartilham dados somente quando usam o mesmo servidor. Distribuir cópias do ZIP a cada campus produziria bases independentes; para acesso remoto centralizado é necessária hospedagem institucional com HTTPS e autenticação integrada.

A senha é local, não verificada pelo provedor de identidade do IFPR. O e-mail com domínio institucional não comprova vínculo por si só; o cadastro é feito pelo ADMIN. Há hash scrypt, cookies HttpOnly/SameSite, bloqueio de origem para mutações, limite de tentativas e autorização por campus. Recuperação de senha, revogação pelo painel, autenticação federada, expiração de sessões persistentes, backups operacionais e auditoria avançada ainda precisam ser implementados antes de produção.

Os PDFs são armazenados e disponibilizados para consulta, mas não há OCR/IA para extrair datas, comparar automaticamente o histórico ou preencher decisões locais. A checagem de upload atual verifica tamanho, extensão e assinatura PDF; não é inspeção antivírus ou validação integral do arquivo. O arquivo de dados local deve ser protegido e não deve ir ao GitHub.

O modelo impresso ainda precisa de conferência visual da DENTEC para fidelidade final, incluindo logomarca e paginação. Não se gera XLSX nesta etapa. O calendário final continua sendo proposta sem aprovação oficial. Datas ainda não anunciadas e verificações de horas, sequência pedagógica, atas, exceções e o checklist integral não são dadas como atendidas.

## Verificação

16 testes automatizados aprovados, incluindo contagem, Foz na lista, escopo por ano/oferta, contas, negação de acesso entre campi, impedimento de edição ADMIN pela conta CAMPUS, revisão da base, conflito de salvamento, armazenamento histórico, persistência e escape de texto no modelo gráfico.

Conferência no navegador: criação de conta ADMIN em base de teste, seleção de Foz, criação de integrado com curso/turma/turno, herança de datas e salvamento. No período de 01 a 12/02/2027, a semana segunda–sexta resultou em 7 dias, após descontar os recessos institucionais de 08, 09 e 10/02.
