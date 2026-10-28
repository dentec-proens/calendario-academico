# Acesso e contas

Identidades, credenciais e sessões usam [Convex Auth](https://labs.convex.dev/auth), a biblioteca `@convex-dev/auth` instalada e configurada no projeto, executada dentro do backend Convex. A aplicação define os fluxos de provisionamento, convite e recuperação, o hash de senha e as regras de autorização. Não há cadastro público irrestrito: a conta deve estar autorizada e ativa. O papel CAMPUS exige vínculo com uma unidade; ADMIN gerencia as contas e tem acesso a todos os campi.

## Criação e ativação

Em **Contas e acessos**, o ADMIN informa responsável, e-mail institucional, perfil e campus, quando aplicável. As formas de acesso disponíveis são convite por link e senha definida pelo ADMIN. O login Google institucional está intencionalmente desabilitado até segundo aviso.

No convite, a conta fica pendente até o titular confirmar seu e-mail e criar a senha. O link é de uso único e vale por 48 horas. Gerar novo convite invalida o anterior. O sistema exibe o link na geração; o ADMIN deve copiá-lo e entregá-lo somente ao destinatário. Não há envio automático de e-mail.

A primeira conta ADMIN é criada pela tela de instalação com o e-mail autorizado e o código privado de implantação. Senhas locais devem ter de 10 a 128 caracteres e ser próprias do aplicativo.

## Recuperação de senha

O titular solicita um link à administração DENTEC/PROENS, informando o e-mail cadastrado. A página pública oferece um atalho para abrir o e-mail; ela não envia a solicitação automaticamente.

Na conta correspondente, o ADMIN usa **Gerar link de recuperação** e entrega o link pelo procedimento institucional. Ele vale por 24 horas, tem uso único e invalida links de recuperação anteriores. A senha só muda quando o titular conclui a redefinição; as sessões existentes são então revogadas.

Remover o acesso de uma conta cancela seus convites e sessões e preserva calendários, pareceres e autoria histórica. Links de convite e recuperação são credenciais temporárias: não devem entrar em relatórios públicos, logs ou Git.

## Google institucional

**O login pelo Google está intencionalmente desabilitado até segundo aviso, por decisão do projeto.** A integração permanece preparada no código; sua ausência na tela de acesso é esperada. Não habilitar o provedor como parte de uma configuração ou publicação rotineira.

O código condiciona a habilitação à presença de `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET` no ambiente Convex; essas credenciais devem permanecer sem configuração enquanto vigorar a decisão. Uma futura reativação exige instrução explícita e validação da configuração de retorno e dos fluxos reais. A conta institucional deve estar previamente autorizada e ativa; autenticar com Google não concede vínculo ou permissões adicionais.

Configurar Google não habilita envio de convites ou recuperação por e-mail. O envio automático permanece indisponível.

## Privacidade dos formulários

Login, primeiro ADMIN, ativação e redefinição usam TanStack Form com submissão e erros explícitos. Senhas, códigos e tokens não entram no registro de rascunhos ou na instrumentação Devtools. O fragmento secreto dos links é retirado antes da criação do Router; o token permanece somente no fluxo temporário. Ao sair, reabra o link privado para continuar.

Logout e mudança de identidade limpam os rascunhos da sessão. Alterar papel/campus ou remover um membro revoga sessões conforme a operação; o backend repete a autorização mesmo quando a tela já estava aberta.

## Autenticação recente e desbloqueio

Criar ou alterar acessos, emitir links e desbloquear senha exige ADMIN com login realizado nos últimos 15 minutos. Se a tela pedir autenticação recente, saia e entre novamente; renovar a sessão automaticamente não renova essa exigência.

Depois de repetidos erros de senha, a conta pode recusar temporariamente até a senha correta. Em **Contas e acessos**, o ícone **Desbloquear login por senha** da conta local ativa permite ao ADMIN liberar novas tentativas, com auditoria. A senha permanece a mesma. Confirme o titular antes de usar. O [guia de segurança operacional](seguranca.md) descreve a contingência para ADMIN bloqueado, os hashes versionados e a futura validação de runtime.
