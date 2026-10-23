# Acesso e contas

Identidades, credenciais e sessões pertencem ao Convex Auth. Não há cadastro público irrestrito: a conta deve estar autorizada e ativa. O papel CAMPUS exige vínculo com uma unidade; ADMIN gerencia as contas e tem acesso a todos os campi.

## Criação e ativação

Em **Campi e contas**, o ADMIN informa responsável, e-mail institucional, perfil e campus, quando aplicável. As formas de acesso são convite por link, senha definida pelo ADMIN ou Google institucional, quando habilitado.

No convite, a conta fica pendente até o titular confirmar seu e-mail e criar a senha. O link é de uso único e vale por 48 horas. Gerar novo convite invalida o anterior. O sistema exibe o link na geração; o ADMIN deve copiá-lo e entregá-lo somente ao destinatário. Não há envio automático de e-mail.

A primeira conta ADMIN é criada pela tela de instalação com o e-mail autorizado e o código privado de implantação. Senhas locais devem ter de 10 a 128 caracteres e ser próprias do aplicativo.

## Recuperação de senha

O titular solicita um link à administração DENTEC/PROENS, informando o e-mail cadastrado. A página pública oferece um atalho para abrir o e-mail; ela não envia a solicitação automaticamente.

Na conta correspondente, o ADMIN usa **Gerar link de recuperação** e entrega o link pelo procedimento institucional. Ele vale por 24 horas, tem uso único e invalida links de recuperação anteriores. A senha só muda quando o titular conclui a redefinição; as sessões existentes são então revogadas.

Remover o acesso de uma conta cancela seus convites e sessões e preserva calendários, pareceres e autoria histórica. Links de convite e recuperação são credenciais temporárias: não devem entrar em relatórios públicos, logs ou Git.

## Google institucional

A opção depende de `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET` no ambiente Convex e da configuração de retorno do provedor. A conta institucional deve estar previamente autorizada e ativa; autenticar com Google não concede vínculo ou permissões adicionais.

Configurar Google não habilita envio de convites ou recuperação por e-mail. O envio automático permanece indisponível.
