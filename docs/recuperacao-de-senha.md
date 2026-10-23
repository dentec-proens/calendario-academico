# Recuperação de acesso

Identidades, credenciais e sessões pertencem ao Convex Auth. A conta precisa estar cadastrada e ativa; não existe cadastro público irrestrito. Um ADMIN pode gerar convites e links temporários de recuperação para os membros autorizados. Remover o acesso revoga as sessões e conserva a autoria histórica.

Convites e recuperação são validados no backend, com expiração e uso único. A senha só muda após a conclusão pelo titular. As senhas devem seguir o tamanho permitido pelo portal; use uma senha própria do aplicativo.

A recuperação atual usa um link temporário gerado pelo ADMIN e entregue ao titular pelo procedimento institucional autorizado. O formulário público orienta o usuário a contatar a administração. O envio automático por e-mail ainda precisa ser implementado; configurar um provedor de e-mail, por si só, não o habilita. Links de recuperação são credenciais temporárias e não devem entrar em relatórios, arquivos públicos ou Git.

O login Google é opcional e usa `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET` no Convex. O URI de retorno pertence ao domínio HTTP do deployment Convex e deve seguir a configuração do Convex Auth. A autorização por e-mail institucional não substitui o cadastro ativo e o vínculo de campus. A disponibilidade depende da configuração e autorização dos provedores.

Referência: [Convex Auth](https://labs.convex.dev/auth).
