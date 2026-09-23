# Login Google institucional — configuração pela TI

## Situação desta entrega

Implementação preparada e testada com respostas Google simuladas e tokens assinados de teste. Login real não ativado nem testado porque não foram fornecidas credenciais OAuth institucionais. Não foram enviados e-mails, criados projetos Google nem alteradas permissões de contas reais.

O login atual com senha local é preservado. A autenticação Google aceita exclusivamente contas Google Workspace com e-mail @ifpr.edu.br verificado e domínio organizacional hd=ifpr.edu.br. A TI deve confirmar que as contas institucionais utilizam Google Workspace; um endereço institucional adicionado a uma conta Google pessoal não basta.

## Configuração

1. A TI cria/seleciona um projeto institucional no Google Cloud, configura a tela de consentimento conforme a organização e cria um cliente OAuth do tipo Aplicação Web. Para uso interno no Google Workspace, configure a audiência interna e as permissões da organização com a TI.
2. Cadastre exatamente o URI de retorno. Para teste local: http://127.0.0.1:4173/api/google/callback. Para implantação institucional: https://DOMINIO-REAL/api/google/callback, com o domínio real.
3. Copie .env.example para .env junto de server.mjs, apenas no servidor. Preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET com as credenciais do cliente. Defina DENTEC_PUBLIC_URL com a origem efetiva. Não envie o segredo pelo chat, não coloque em arquivos web, repositórios, pacotes ou logs. Restrinja a leitura do .env à conta do serviço.
4. Reinicie o servidor. O botão Entrar com Google institucional será habilitado quando ambas as credenciais estiverem presentes. Isso indica configuração presente, não certifica que ela é válida no Google. Teste com uma conta institucional autorizada em navegador normal; o Google pode recusar navegadores incorporados.
5. Em Campi e contas, o ADMIN escolhe Google institucional como forma de acesso e cadastra nome, e-mail, perfil e campus quando aplicável. Não precisa definir senha local. Essa autorização não envia convite por e-mail. Contas locais já cadastradas e ativas também podem entrar com sua identidade Google institucional de mesmo e-mail após a ativação.

A senha Google é fornecida somente ao Google. O sistema solicita apenas openid e email, sem acesso a Gmail, Drive ou Calendário. Após validar a identidade, exige usuário ativo previamente cadastrado e mantém seu perfil/campus. Não existe autocadastro público. A identidade fica vinculada ao identificador Google sub para evitar troca silenciosa de conta.

Para uso entre campi, ainda é necessária implantação com HTTPS e serviço institucional. DENTEC_PUBLIC_URL não publica nem expõe o servidor: ele continua vinculado a 127.0.0.1. Uma implantação deve configurar proxy HTTPS e operação institucional adequados. Não use o servidor de desenvolvimento como serviço público sem a etapa de implantação.

## Verificações

Fluxo authorization code com PKCE S256, state de uso único vinculado ao navegador, nonce, prazo de dez minutos, assinatura RS256 via chaves públicas do Google, emissor, audiência, expiração, e-mail verificado e domínio organizacional. Tokens Google não são persistidos. A sessão usa cookie HttpOnly; Secure quando a origem configurada é HTTPS. Domínio, autorização prévia e vínculo ao campus são verificados no servidor.

22 testes passaram: rejeição de Gmail, domínio diferente/ausente, e-mail não verificado, assinatura/audiência/emissor/nonce incorretos, token expirado, state inválido/reutilizado, fluxo PKCE, usuário não cadastrado, preservação do perfil/campus e recusa de identidade Google diferente da já vinculada. O envio de convites por e-mail permanece pendente da escolha e configuração do serviço de e-mail.

Referências oficiais: [OpenID Connect do Google](https://developers.google.com/identity/openid-connect/openid-connect) e [validação de identidade e domínio no servidor](https://developers.google.com/identity/sign-in/web/backend-auth).
