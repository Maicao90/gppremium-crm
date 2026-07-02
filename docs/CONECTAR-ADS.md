# Como conectar seus anúncios ao CRM (Google Ads e Meta Ads)

**Para quem é este guia:** para você, dono da loja, sem precisar de nenhum conhecimento técnico.

**O que vamos fazer:** pegar as "chaves de acesso" (credenciais) do Google Ads e da Meta (Facebook/Instagram) para colar na tela **Configurações → Conexões de Anúncios** do seu CRM. Com isso, o CRM passa a mostrar os dados dos seus anúncios automaticamente.

**Tempo estimado:** 40 a 60 minutos de trabalho seu + alguns dias úteis de espera pela aprovação do Google (explicado abaixo).

---

## ⚠️ ANTES DE COMEÇAR: avisos de segurança

> **Essas chaves são como a senha do cofre da loja.**
> Quem tiver essas chaves consegue ver (e em alguns casos mexer) nas suas contas de anúncio.
>
> - **NUNCA** envie essas chaves por WhatsApp, e-mail, chat ou mensagem para ninguém.
> - Cole cada chave **direto no painel do CRM**, na tela Configurações → Conexões de Anúncios.
> - Se você desconfiar que alguma chave vazou: **revogue (cancele) a chave antiga e gere uma nova**. Os passos de gerar de novo são os mesmos deste guia.
> - Não tire print das chaves nem salve em bloco de notas compartilhado.

---

# PARTE 1 — Google Ads

Você vai sair desta parte com 6 informações em mãos:

| O que é | Exemplo de aparência |
|---|---|
| Developer Token | `Ab1cDe2fGh3iJk4lMn5oPq` |
| Client ID | `123456789-abc123.apps.googleusercontent.com` |
| Client Secret | `GOCSPX-xxxxxxxxxxxx` |
| Refresh Token | `1//0xxxxxxxxxxxxxxxxxxxx` |
| Customer ID | `1234567890` (10 dígitos) |
| Login Customer ID | `9876543210` (só se usar conta de gerenciador) |

## Passo 1.1 — Criar uma Conta de Gerenciador (MCC), se ainda não tiver

O Developer Token (a chave principal do Google) só existe dentro de uma **Conta de Gerenciador**, também chamada de **MCC**. É uma conta "guarda-chuva" gratuita que fica por cima da sua conta de anúncios normal.

1. Acesse: https://ads.google.com/home/tools/manager-accounts/
2. Clique em **Criar uma conta de administrador** (ou "Criar conta de gerenciador").
3. Entre com o seu e-mail do Google (pode ser o mesmo que você já usa no Google Ads).
4. Dê um nome (ex.: "Gerenciador Super Via Pneus"), escolha **Brasil**, moeda **Real (BRL)** e conclua.
5. Depois de criada, dentro da conta de gerenciador, vincule sua conta de anúncios normal: menu **Contas** → botão **+** → **Vincular conta existente** → digite o número da sua conta de anúncios → o Google envia um convite → aceite o convite dentro da sua conta de anúncios normal.

> Se você já tem uma conta de gerenciador (MCC), pule para o passo 1.2.

## Passo 1.2 — Pegar o Developer Token no Centro de API

1. Entre na sua **Conta de Gerenciador (MCC)** em https://ads.google.com
2. No topo, clique em **Ferramentas e configurações** (ícone de chave inglesa 🔧).
3. Na coluna **Configuração**, clique em **Centro de API** (em inglês: API Center).
   - Se não aparecer "Centro de API", confirme que você está dentro da conta de GERENCIADOR, e não na conta de anúncios comum.
4. Aceite os termos da API, preencha os dados da empresa que forem pedidos.
5. O **Developer Token** aparece nessa tela. Copie e guarde.

### ⚠️ IMPORTANTE: os "níveis de acesso" do Developer Token

O token nasce com **Acesso de teste** e precisa ser promovido para **Acesso básico**:

- **Acesso de teste** (como o token é criado): o token **só funciona com contas de teste** do Google Ads (contas falsas, sem anúncios reais). Ou seja: **com acesso de teste, o CRM NÃO vai conseguir ler os dados dos seus anúncios de verdade.**
- **Acesso básico**: funciona com contas reais (é o que você precisa). Para conseguir, é preciso **preencher um formulário de solicitação** do Google, e a análise **demora alguns dias úteis**.

Como pedir o Acesso básico:

1. Na mesma tela do **Centro de API**, procure o nível de acesso (aparece como "Acesso de teste" / "Test account access").
2. Clique em **Solicitar acesso básico** (ou no link "Aplicar para acesso básico" / "Apply for Basic access"), que abre o formulário do Google.
3. Preencha com calma. Dicas de resposta:
   - **Para que vai usar a API:** "Painel interno (CRM) para visualizar relatórios das minhas próprias campanhas de Google Ads. Uso próprio, não é ferramenta vendida a terceiros."
   - **Quem vai usar:** apenas a sua empresa.
4. Aguarde o e-mail de aprovação do Google (normalmente de 1 a 5 dias úteis).

> Você pode seguir com os passos 1.3 a 1.6 enquanto espera a aprovação. Só a conexão final no CRM é que depende do acesso básico aprovado.

## Passo 1.3 — Criar um projeto no Google Cloud e ativar a Google Ads API

1. Acesse o Google Cloud Console: https://console.cloud.google.com (entre com o MESMO e-mail do Google Ads).
2. No topo da tela, clique no seletor de projetos e depois em **Novo projeto**.
3. Dê um nome (ex.: "CRM Anuncios") e clique em **Criar**. Aguarde e selecione esse projeto.
4. No menu lateral (☰), vá em **APIs e serviços** → **Biblioteca**.
5. Na busca, digite **Google Ads API** e clique no resultado.
6. Clique no botão **Ativar**.

## Passo 1.4 — Configurar a Tela de consentimento OAuth

É a telinha de "Fazer login com o Google" que vai aparecer uma única vez para você autorizar o acesso.

1. Ainda no Google Cloud, vá em **APIs e serviços** → **Tela de permissão OAuth** (também aparece como "Tela de consentimento OAuth").
2. Tipo de usuário: escolha **Externo** e clique em **Criar**.
3. Preencha o mínimo obrigatório:
   - **Nome do app:** ex. "CRM Anuncios"
   - **E-mail para suporte do usuário:** o seu e-mail
   - **Dados de contato do desenvolvedor:** o seu e-mail
4. Clique em **Salvar e continuar** nas telas seguintes (não precisa adicionar nada em "Escopos").
5. Na etapa **Usuários de teste**, clique em **+ Adicionar usuários** e adicione **o seu próprio e-mail do Google**. Salve.
6. Conclua. Não é preciso "publicar" o app para o público; ele pode ficar em modo "Em teste".

> Se o app ficar em modo "Em teste", o Google pode expirar a autorização depois de um tempo. Se um dia o CRM parar de ler os dados do Google, volte na Tela de permissão OAuth, clique em **Publicar app** e gere o Refresh Token de novo (passo 1.6).

## Passo 1.5 — Criar a credencial OAuth (Client ID e Client Secret)

1. No Google Cloud, vá em **APIs e serviços** → **Credenciais**.
2. Clique em **+ Criar credenciais** → **ID do cliente OAuth**.
3. Em **Tipo de aplicativo**, escolha **App para computador** (em inglês: "Desktop app").
4. Nome: ex. "CRM Desktop". Clique em **Criar**.
5. Vai aparecer uma janela com o **ID do cliente** (Client ID) e a **Chave secreta do cliente** (Client Secret). Copie os dois. Você também pode baixar o arquivo JSON como cópia de segurança — guarde em local seguro, ele contém as chaves.

## Passo 1.6 — Gerar o Refresh Token no OAuth 2.0 Playground

O Refresh Token é a "autorização permanente" para o CRM ler seus dados sem pedir login toda hora.

1. Abra: https://developers.google.com/oauthplayground
2. No canto superior direito, clique na **engrenagem** (⚙️ "OAuth 2.0 configuration").
3. Marque a caixinha **"Use your own OAuth credentials"** (usar suas próprias credenciais).
4. Cole o seu **Client ID** em "OAuth Client ID" e o **Client Secret** em "OAuth Client secret". Feche a janelinha da engrenagem.
5. Na coluna da esquerda ("Step 1"), NÃO procure na lista: no campo de texto **"Input your own scopes"**, cole exatamente:
   ```
   https://www.googleapis.com/auth/adwords
   ```
6. Clique no botão azul **Authorize APIs**.
7. Faça login com o e-mail que tem acesso ao Google Ads. Se aparecer o aviso "O Google não verificou este app", clique em **Avançado** → **Acessar CRM Anuncios (não seguro)** — é o SEU próprio app, pode confiar.
8. Autorize o acesso ("Permitir" / "Continuar").
9. De volta ao Playground, no "Step 2", clique em **Exchange authorization code for tokens**.
10. Vai aparecer o **Refresh token** (começa com `1//`). Copie e guarde. É essa a chave que vai no CRM.

> **Se der o erro "Erro 400: redirect_uri_mismatch" no passo 7:** volte ao Google Cloud → **APIs e serviços** → **Credenciais** → **+ Criar credenciais** → **ID do cliente OAuth**, mas desta vez escolha o tipo **Aplicativo da Web**, e em **URIs de redirecionamento autorizados** clique em **+ Adicionar URI** e cole `https://developers.google.com/oauthplayground`. Salve, e repita o passo 1.6 usando o Client ID e Client Secret DESSA nova credencial (e use esse mesmo par no CRM).

## Passo 1.7 — Achar o Customer ID (e o Login Customer ID)

1. Entre em https://ads.google.com na sua **conta de anúncios normal** (a que roda as campanhas da loja).
2. Olhe no **canto superior direito** da tela: aparece um número no formato **XXX-XXX-XXXX** (ex.: 123-456-7890). Esse é o seu **Customer ID**.
3. No CRM, digite **só os 10 números, sem os traços** (ex.: 1234567890).
4. **Login Customer ID (opcional):** só preencha se você acessa a conta ATRAVÉS da conta de gerenciador (MCC). Nesse caso, entre na conta de gerenciador e copie o número dela (também fica no canto superior direito), sem traços. Se você não usa MCC para acessar, deixe em branco.

---

# PARTE 2 — Meta (Facebook / Instagram Ads)

Você vai sair desta parte com 2 informações em mãos:

| O que é | Exemplo de aparência |
|---|---|
| Access Token (usuário do sistema) | `EAAGxxxxxxxxxxxxxxxx...` (bem longo) |
| ID da conta de anúncios | `act_1234567890` |

**Pré-requisito:** ter um **Gerenciador de Negócios** (Business Manager) em https://business.facebook.com com a sua conta de anúncios dentro dele. Se seus anúncios rodam só no perfil pessoal, crie o Gerenciador de Negócios primeiro (é gratuito, em https://business.facebook.com/overview clique em **Criar conta**) e adicione sua conta de anúncios nele.

## Passo 2.1 — Criar um app na plataforma de desenvolvedores da Meta

1. Acesse: https://developers.facebook.com
2. Faça login com o Facebook que administra o seu negócio.
3. Clique em **Meus apps** (canto superior direito) → **Criar app**.
4. Quando perguntar o caso de uso, escolha a opção **Outro** (se aparecer) e avance.
5. Em **tipo de app**, escolha **Empresa** (em inglês: "Business"). Avance.
6. Preencha:
   - **Nome do app:** ex. "CRM GP Premium"
   - **E-mail de contato:** o seu
   - **Portfólio empresarial / Conta do Gerenciador de Negócios:** selecione o SEU Gerenciador de Negócios (isso vincula o app ao seu negócio — é obrigatório para o passo do token funcionar).
7. Clique em **Criar app**.

## Passo 2.2 — Adicionar o produto "Marketing API" ao app

1. Dentro do painel do app recém-criado, procure a seção **Adicionar produtos ao seu app** (ou "Produtos" no menu lateral esquerdo).
2. Encontre o cartão **Marketing API** e clique em **Configurar**.
3. Pronto — não precisa configurar mais nada dentro do produto. O app só precisa "ter" a Marketing API.

> O app pode ficar em **modo de desenvolvimento**. Para ler dados das SUAS próprias contas de anúncio com um usuário do sistema, não é preciso passar pela análise/revisão pública da Meta.

## Passo 2.3 — Criar um Usuário do Sistema no Gerenciador de Negócios

O "usuário do sistema" é um funcionário-robô: ele não é uma pessoa, então o token dele **não expira** quando alguém troca a senha ou sai de férias.

1. Acesse: https://business.facebook.com
2. Vá em **Configurações do negócio** (ícone de engrenagem, ou menu ☰ → Configurações).
3. No menu esquerdo: **Usuários** → **Usuários do sistema**.
4. Clique em **Adicionar**.
5. Nome: ex. "crm-integracao". Função: **Funcionário** já é suficiente (só leitura de dados; não escolha Administrador sem necessidade).
6. Clique em **Criar usuário do sistema**.

## Passo 2.4 — Dar acesso da conta de anúncios ao Usuário do Sistema

1. Ainda na tela do usuário do sistema, clique em **Adicionar ativos** (ou "Atribuir ativos").
2. Na janela: escolha **Contas de anúncios** → marque a sua conta de anúncios.
3. Nas permissões, ative **Visualizar desempenho** (leitura de relatórios é suficiente para o CRM; não precisa de "Gerenciar conta").
4. Clique em **Salvar alterações**.

## Passo 2.5 — Gerar o Access Token (o que não expira)

1. Na tela do usuário do sistema, clique em **Gerar novo token**.
2. **Selecionar app:** escolha o app que você criou no passo 2.1 (ex. "CRM GP Premium").
3. **Validade do token / Expiração:** escolha **Nunca** ("Never" / "Nunca expira"). É isso que torna esse token "de longa duração".
4. **Permissões:** marque APENAS estas duas:
   - `ads_read` (ler dados de anúncios)
   - `read_insights` (ler relatórios de desempenho)
5. Clique em **Gerar token**.
6. **Copie o token AGORA** (é um texto bem longo começando com `EAA...`). A Meta mostra ele uma única vez. Cole direto no CRM.

> Perdeu o token antes de colar? Sem problema: gere um novo token no mesmo lugar. Vazou? Clique nos três pontinhos do token → revogar, e gere outro.

## Passo 2.6 — Achar o ID da conta de anúncios

1. Em https://business.facebook.com, vá em **Configurações do negócio**.
2. Menu esquerdo: **Contas** → **Contas de anúncios**.
3. Clique na sua conta de anúncios: o **número de identificação** aparece logo abaixo do nome (ex.: 1234567890).
4. No CRM, digite no formato **`act_` + o número**, tudo junto: `act_1234567890`.

---

# PARTE 3 — Checklist final: o que ter em mãos antes de abrir o painel

Imprima ou marque conforme for conseguindo. Quando TODAS as caixinhas estiverem marcadas, abra o CRM em **Configurações → Conexões de Anúncios** e cole tudo.

## Google Ads

- [ ] Tenho uma **Conta de Gerenciador (MCC)** e minha conta de anúncios está vinculada a ela
- [ ] Copiei o **Developer Token** do Centro de API
- [ ] Meu Developer Token tem **Acesso básico APROVADO** (recebi o e-mail do Google) — sem isso, só funciona com contas de teste
- [ ] Copiei o **Client ID** (termina em `.apps.googleusercontent.com`)
- [ ] Copiei o **Client Secret** (começa com `GOCSPX-`)
- [ ] Gerei e copiei o **Refresh Token** no OAuth Playground (começa com `1//`)
- [ ] Anotei o **Customer ID** — 10 números, SEM traços
- [ ] (Só se uso MCC para acessar) Anotei o **Login Customer ID** — 10 números, sem traços

## Meta (Facebook/Instagram)

- [ ] Criei o **app tipo Empresa** em developers.facebook.com, vinculado ao meu Gerenciador de Negócios
- [ ] Adicionei o produto **Marketing API** ao app
- [ ] Criei o **Usuário do Sistema** e atribuí minha conta de anúncios a ele (permissão "Visualizar desempenho")
- [ ] Gerei e copiei o **Access Token** com validade **Nunca** e permissões `ads_read` + `read_insights`
- [ ] Anotei o **ID da conta de anúncios** no formato `act_NUMERO`

## Segurança

- [ ] Não mandei NENHUMA dessas chaves por WhatsApp, e-mail ou chat
- [ ] Colei tudo direto no painel do CRM e apaguei qualquer rascunho

---

*Dúvidas ou algo diferente na tela? Os menus do Google e da Meta mudam de nome de vez em quando — procure pelo nome mais parecido ou fale com o suporte do CRM.*
