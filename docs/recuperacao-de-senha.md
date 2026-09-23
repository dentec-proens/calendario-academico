# Recuperação de senha

A tela de entrada oferece “Recuperar senha”. A conta precisa estar ativa e ter senha local. Contas desativadas, removidas ou exclusivamente Google não são reativadas pelo fluxo.

## Configuração pendente de produção

Configurar na Vercel, como segredos, `RESEND_API_KEY` e `DENTEC_MAIL_FROM` (endereço de remetente verificado no Resend). Configurar apenas para o ambiente autorizado e republicar. A funcionalidade não envia mensagens sem essas duas variáveis; mostra aviso explícito. Não usar a senha do e-mail institucional como chave. O remetente precisa ser autorizado pelo responsável pelo domínio. Nenhuma conta de serviço foi criada automaticamente.

Referência da integração: https://resend.com/docs/api-reference/emails/send-email

Antes de liberar, testar com uma conta institucional controlada: recebimento, spam, redefinição, login e rejeição do link usado. Resposta do provedor não comprova entrega na caixa de entrada. Validar contratação e tratamento de dados do provedor com a instituição antes de enviar e-mails reais.

## Controles

Tokens aleatórios de 256 bits, armazenados somente como hash, com validade de 30 minutos. O link usa fragmento, removido da barra ao abrir. Não registrar tokens em logs. Consumo e troca de senha ocorrem na mesma transação; todos os links e sessões daquela conta são invalidados após sucesso. A senha usa o mecanismo scrypt existente. Papel, campus e dados acadêmicos permanecem intactos.

Respostas não revelam se a conta existe. Limites persistentes: três pedidos por endereço a cada 15 minutos e 60 por hora no sistema. Falhas de envio invalidam o token e registram `PASSWORD_RECOVERY_DELIVERY_FAILED`, sem conteúdo do provedor nem link. Sucesso registra `RESET_PASSWORD`. O limite global pode afetar disponibilidade sob abuso; considerar controle adicional na borda em produção.

Esta alteração implementa recuperação de senha, não envio automático dos convites de cadastro. Convites continuam sendo links compartilhados manualmente.

## Uso manual sem serviço de e-mail

Na administração, contas ativas com senha local têm “Gerar link de recuperação”. Confirme o destinatário, copie o link e envie pelo e-mail institucional. O sistema não envia e-mail nesse modo. Gerar outro link invalida os anteriores. Feche o painel depois de copiar. A página pública oferece um atalho para abrir o aplicativo de e-mail e solicitar ajuda; clicar não envia mensagem sozinho.

A recuperação do único administrador que perdeu a senha precisa do responsável autenticado pela infraestrutura, com registro de auditoria. Não existe recuperação pública por código de instalação, e-mail informado ou pergunta pessoal.
