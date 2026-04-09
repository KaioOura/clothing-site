# MAISON·BR — Instruções de Deploy

## O que você vai precisar (tudo gratuito para começar)
- Conta no **Railway** (railway.app) — hospedagem do backend e banco de dados
- Conta no **Mercado Pago** (mercadopago.com.br) — gateway de pagamento
- Conta no **GitHub** (github.com) — para conectar ao Railway
- Um editor de texto (VS Code, Notepad++, etc.)

---

## PASSO 1 — Criar sua conta no Mercado Pago Developers

1. Acesse https://www.mercadopago.com.br/developers
2. Faça login com sua conta do Mercado Pago (ou crie uma)
3. Clique em **"Criar aplicação"**
4. Dê um nome: `MAISON-BR`
5. Selecione **"Pagamentos online"** e **"CheckoutPro"**
6. Clique em **"Criar aplicação"**
7. Na tela da aplicação, vá em **"Credenciais de produção"**
8. Copie o **Access Token** (começa com `APP_USR-...`)

⚠️ **Para testes**, use as credenciais de **Sandbox** primeiro.
As credenciais de sandbox começam com `TEST-`.

---

## PASSO 2 — Subir o backend no GitHub

1. Acesse https://github.com e crie uma conta (se ainda não tiver)
2. Clique em **"New repository"**
3. Nome: `maison-br-backend`
4. Deixe como **Public** e clique em **"Create repository"**
5. No seu computador, instale o Git: https://git-scm.com/downloads
6. Abra o terminal (Prompt de Comando no Windows) na pasta `backend/`
7. Execute os comandos abaixo um por um:

```bash
git init
git add .
git commit -m "primeiro commit"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/maison-br-backend.git
git push -u origin main
```

> Substitua `SEU-USUARIO` pelo seu usuário do GitHub.

---

## PASSO 3 — Deploy no Railway

1. Acesse https://railway.app e clique em **"Login with GitHub"**
2. Clique em **"New Project"**
3. Escolha **"Deploy from GitHub repo"**
4. Selecione o repositório `maison-br-backend`
5. Railway vai detectar automaticamente que é Node.js e fazer o deploy

### 3.1 — Adicionar banco de dados PostgreSQL

1. Dentro do projeto no Railway, clique em **"+ New"**
2. Escolha **"Database"** → **"PostgreSQL"**
3. O banco será criado automaticamente

### 3.2 — Configurar variáveis de ambiente

1. Clique no serviço do backend (não no banco)
2. Vá em **"Variables"**
3. Clique em **"Add Variable"** e adicione cada uma:

```
MP_ACCESS_TOKEN    = APP_USR-SEU-TOKEN-DO-MERCADO-PAGO
PORT               = 3001
FRONTEND_URL       = https://SEU-SITE.com
BACKEND_URL        = https://SEU-APP.railway.app
WEBHOOK_SECRET     = qualquer-string-longa-aleatoria
```

4. Para `DATABASE_URL`: clique em **"Add Reference"**, selecione o PostgreSQL,
   escolha a variável `DATABASE_URL`. Isso conecta automaticamente.

### 3.3 — Pegar a URL do backend

1. No serviço do backend, vá em **"Settings"**
2. Em **"Domains"**, clique em **"Generate Domain"**
3. Você vai receber algo como: `https://maison-br-backend-production.up.railway.app`
4. Guarde essa URL — você vai precisar dela

---

## PASSO 4 — Configurar o Webhook do Mercado Pago

O webhook é o que faz o Mercado Pago avisar o seu backend quando um pagamento é aprovado.

1. Acesse https://www.mercadopago.com.br/developers/panel
2. Clique na sua aplicação (`MAISON-BR`)
3. Vá em **"Webhooks"**
4. Clique em **"Adicionar"**
5. URL: `https://SEU-APP.railway.app/webhook/mercadopago`
6. Eventos: marque **"Pagamentos"**
7. Salve

---

## PASSO 5 — Configurar o frontend

1. Abra o arquivo `frontend/index.html` no seu editor de texto
2. Procure a linha:
   ```javascript
   const API = 'https://SEU-APP.railway.app';
   ```
3. Troque pelo endereço real do seu backend (do Passo 3.3)
4. Procure também:
   ```javascript
   const ADMIN_PASS = 'admin123';
   ```
5. Troque por uma senha que você vai lembrar

---

## PASSO 6 — Hospedar o frontend

### Opção A: Netlify (mais fácil — recomendado)
1. Acesse https://netlify.com e crie uma conta com GitHub
2. Clique em **"Add new site"** → **"Deploy manually"**
3. Arraste a pasta `frontend/` para a área indicada
4. Pronto! Você vai receber uma URL como `https://nome-aleatorio.netlify.app`
5. Use esse endereço como `FRONTEND_URL` nas variáveis do Railway

### Opção B: GitHub Pages
1. Crie um repositório `maison-br-frontend` no GitHub
2. Suba o arquivo `index.html`
3. Vá em Settings → Pages → selecione `main` como branch
4. A URL será: `https://SEU-USUARIO.github.io/maison-br-frontend`

---

## PASSO 7 — Atualizar FRONTEND_URL no Railway

Agora que o frontend tem um endereço:
1. Vá no Railway → seu projeto → Variables
2. Atualize `FRONTEND_URL` com o endereço do Netlify/GitHub Pages
3. Railway vai reiniciar automaticamente

---

## Como usar o painel de admin

1. Abra o site
2. Clique em **"⚙ Admin"** no canto superior direito
3. Digite a senha que você definiu
4. Na aba **"Produtos"**: adicione, edite ou remova produtos
5. Na aba **"Pedidos"**: veja todos os pedidos, abra o detalhe de cada um, atualize o status e adicione código de rastreio

### Status dos pedidos (em ordem)
| Status | Significado |
|--------|-------------|
| Recebido | Pedido foi criado no sistema |
| Pendente | Aguardando pagamento |
| Confirmado | Pagamento aprovado pelo Mercado Pago |
| Despachado | Você enviou para a transportadora |
| Em trânsito | Pacote a caminho do cliente |
| Entregue | Pedido entregue ao cliente |

---

## Testando pagamentos (Sandbox)

Para testar sem usar dinheiro real:
1. Use o Access Token de **Sandbox** (começa com `TEST-`)
2. No checkout, use os cartões de teste do Mercado Pago:
   - Aprovado: `5031 4332 1540 6351` · CVV: `123` · Validade: `11/25`
   - Recusado: `4000 0000 0000 0002`
3. Para Pix no sandbox, simule o pagamento no painel de developers

---

## Quando estiver pronta para produção

1. No Mercado Pago, troque para as credenciais de **Produção**
2. Atualize a variável `MP_ACCESS_TOKEN` no Railway com o token real
3. Faça um deploy novamente

---

## Suporte / Dúvidas

Se travar em algum passo, guarde a mensagem de erro exata e me pergunte.
As principais fontes de documentação são:
- Railway: https://docs.railway.app
- Mercado Pago: https://www.mercadopago.com.br/developers/pt/docs
