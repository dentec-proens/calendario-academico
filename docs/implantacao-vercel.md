# Implantação: GitHub e Vercel

Status: aplicativo local validado; adaptação para a Vercel ainda pendente. Não importar a versão local como se já fosse uma aplicação de produção compatível.

## Repositório

Repositório sugerido: `dentec-calendarios`, privado, na conta escolhida pela responsável. Versionar código, testes e documentação. Excluir banco, PDFs enviados, configurações secretas e logs. Os testes serão executados pelo GitHub Actions em cada envio e pull request.

## Adaptações necessárias antes de publicar

1. Persistência: substituir o arquivo JSON local por banco transacional externo. As leituras devem ver alterações de outras instâncias; atualizações devem manter as verificações de versão e o isolamento por campus. Não usar `/tmp` como banco permanente.
2. Arquivos: guardar PDFs em armazenamento privado com autorização no download. O upload atual de até 8 MB em JSON/base64 precisa ser substituído por envio direto autorizado ou mecanismo compatível com os limites da plataforma. Não tornar documentos públicos para contornar o limite de upload.
3. Autenticação: persistir sessões, limites de tentativas e estados temporários de autenticação em serviço compartilhado. O primeiro ADMIN precisa de segredo de instalação protegido. Manter convites de uso único, expiração, autenticação e autorização no servidor.
4. Servidor: disponibilizar o manipulador HTTP como função, configurar roteamento dos arquivos do aplicativo e validar a origem pública HTTPS. Não depender de porta local ou de processo permanentemente ativo.
5. PDF: preparar renderizador compatível com a hospedagem, preservando logo, cores e layout PROENS. O Chrome instalado no Windows não existe na Vercel.
6. Dados existentes: planejar importação protegida separada do GitHub, após escolha do banco e armazenamento. Não enviar `data/database.json` ao repositório.
7. Validação de publicação: verificar login, convites, separação de campi, revisão concorrente, upload/download, PDF e persistência entre duas publicações. Configurar backup e testar restauração antes do uso institucional.

A Vercel hospeda o aplicativo; o banco e os arquivos persistentes precisam de serviços associados. A escolha de serviços, contas, regiões e planos deve ser definida antes de configurar credenciais ou contratar recursos.

Referências oficiais consultadas:
- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/functions/runtimes/node-js
- https://vercel.com/docs/storage


## Implementação em preparação
A branch `prepara-vercel` acrescenta PostgreSQL privado com atualizações transacionais, sessões com tokens armazenados somente como hash, limite compartilhado por conta nas tentativas de login, upload direto para bucket privado Supabase e geração de PDF com Chromium para Linux. A estrutura JSON versionada é mantida em uma linha PostgreSQL nesta transição; isso limita a escalabilidade e deve evoluir para tabelas por entidade antes de carga institucional elevada.

Variáveis em Production: POSTGRES_URL, NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL), SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY), DENTEC_SETUP_EMAIL e DENTEC_SETUP_CODE (segredo de pelo menos 32 caracteres). O e-mail inicial precisa ser institucional. Sem a configuração completa, o servidor responde 503 e não permite criar contas. As chaves fornecidas pela integração permanecem somente no servidor. Login Google permanece desativado na Vercel; senha e convite são os meios previstos.

O bucket `dentec-private` é criado como privado. Uploads recebem autorização temporária vinculada ao usuário e ao destino; o conteúdo PDF é verificado antes de registrar o documento. Downloads são autorizados no servidor e usam links de um minuto. Não há acesso público ao banco via API Supabase: o estado fica no schema privado `dentec_private`, sem permissões PUBLIC e com RLS habilitado.

Não houve importação dos dados locais. O banco online começa vazio. A primeira administração deve ser criada pela responsável após configurar o segredo de instalação. Backups, migração dos dados locais, limpeza periódica de uploads não concluídos e PDFs grandes de exportação ainda precisam de procedimento operacional. Não há promessa de disponibilidade permanente no plano gratuito.

Testes locais não executam PostgreSQL real nem Chromium Linux. O workflow GitHub usa PostgreSQL 16 descartável e executa também o PDF em Linux. Publicação definitiva exige essas verificações e teste no ambiente hospedado.
