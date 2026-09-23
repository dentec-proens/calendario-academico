# Cadastro por convite sem integração com Google ou e-mail

## Usar

Em Campi e contas, selecione “Convite por link · A pessoa cria a senha”. Informe nome, e-mail @ifpr.edu.br, perfil e campus quando aplicável. O ADMIN recebe o link e o envia manualmente à pessoa convidada pelo canal que escolher. O sistema não envia mensagens.

A pessoa abre o link, confirma o e-mail cadastrado e cria uma senha de pelo menos 12 caracteres, repetindo-a para confirmação. A conta permanece inativa até essa etapa. Depois, entra pelo login normal. O ADMIN não precisa conhecer a senha. A senha é armazenada com scrypt e salt individual.

O convite dura 48 horas, é de uso único e fica vinculado à conta e às permissões estabelecidas pelo ADMIN. “Gerar novo convite” invalida os links anteriores. Contas já ativas não podem ser redefinidas por essa função. Somente ADMIN pode gerar convites. O token aleatório tem 256 bits; apenas seu hash fica persistido. O link usa fragmento, que não é enviado em URLs de requisição ou cabeçalhos de referência. A ativação valida novamente o convite na gravação, impedindo reuso concorrente. O token é removido da barra após abrir a página; se ela for recarregada antes da conclusão, reabra o convite original.

A posse do link permite definir a senha: o ADMIN deve encaminhá-lo apenas à pessoa correta. Sem envio e validação por e-mail, o sistema não atesta controle da caixa postal. O cadastro continua limitado a endereços institucionais e pessoas autorizadas pelo ADMIN.

## Acesso de outros computadores

Esta versão não publica o sistema. Links 127.0.0.1/localhost funcionam apenas no computador do servidor; o painel informa isso no próprio convite. O sistema pode ser hospedado em serviço externo sem integração com a TI do IFPR, mas isso exige conta de hospedagem, endereço HTTPS e implantação adequada. DENTEC_PUBLIC_URL configura o endereço canônico dos convites depois da implantação; não abre a rede, não configura proxy e não publica o serviço.

O Google não configurado deixa de aparecer como botão de entrada ou opção de novas contas. Contas e senhas existentes continuam funcionando. A integração Google permanece disponível no código caso seja configurada posteriormente.

## Verificação

23 testes passaram, incluindo criação exclusiva por ADMIN, conta pendente sem acesso, expiração, novo link invalidando o anterior, armazenamento sem token legível, confirmação do e-mail, senha curta rejeitada, ativação e rejeição do segundo uso, login após ativação e preservação do acesso ao campus. Sem envio de e-mails e sem geração de convites reais durante os testes.
