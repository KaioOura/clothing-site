# Off Clothing Bath — Guia de Deploy e Operação

## O que você vai precisar

- Conta no **GitHub** (github.com) — hospedagem do frontend e controle de versão
- Conta no **Railway** (railway.app) — hospedagem do backend e banco de dados PostgreSQL
- Conta no **Mercado Pago** (mercadopago.com.br) — gateway de pagamento
- Conta no **Resend** (resend.com) — envio de e-mails transacionais

---

## Arquitetura do projeto

```
Frontend (GitHub Pages)          Backend (Railway)
─────────────────────            ─────────────────
kaiooura/clothing-site           Node.js + Express
index.html (SPA)       ──────▶  PostgreSQL (Railway)
                                 Mercado Pago API
                                 Resend API
```

- **Frontend:** `https://kaiooura.github.io/clothing-site`
- **Backend:** `https://clothing-site-production.up.railway.app`

---

## PASSO 1 — Configurar o Mercado Pago

1. Acesse https://www.mercadopago.com.br/developers
2. Faça login e clique em **"Criar aplicação"**
3. Nome: `Off Clothing Bath` · Produto: **CheckoutPro** · Clique em **Criar**
4. Na tela da aplicação, vá em **"Credenciais de teste"** (Sandbox)
5. Copie o **Access Token** (começa com `TEST-`)
6. Quando estiver pronto para produção, use **"Credenciais de produção"** (`APP_USR-...`)

---

## PASSO 2 — Configurar o Resend (e-mails)

1. Acesse https://resend.com e crie uma conta
2. Vá em **API Keys** → **Create API Key**
3. Nome: `off-clothing-bath` · Permissão: **Full Access**
4. Copie a chave (começa com `re_...`)

> Durante testes, e-mails só chegam ao endereço cadastrado no Resend (domínio compartilhado).
> Para enviar a qualquer e-mail, adicione um domínio próprio no Resend.

---

## PASSO 3 — Repositórios no GitHub

O projeto usa dois repositórios separados:

| Repositório | Conteúdo | URL |
|---|---|---|
| `clothing-site` | Frontend (index.html) | github.com/kaiooura/clothing-site |
| `clothing-site-backend` | Backend (server.js, db.js) | github.com/kaiooura/clothing-site-backend |

Ambos devem estar **públicos** (ou usar GitHub Pro para privado com Pages).

### Ativar GitHub Pages no frontend

1. Vá em `clothing-site` → **Settings** → **Pages**
2. Source: **Deploy from a branch** → branch `main` → pasta `/root`
3. Salve. O site estará em `https://kaiooura.github.io/clothing-site`

---

## PASSO 4 — Deploy do backend no Railway

1. Acesse https://railway.app → **Login with GitHub**
2. Clique em **New Project** → **Deploy from GitHub repo**
3. Selecione `clothing-site-backend`
4. Railway detecta Node.js automaticamente e faz o deploy

### 4.1 — Adicionar PostgreSQL

1. Dentro do projeto, clique em **+ New** → **Database** → **PostgreSQL**
2. O banco é criado e conectado automaticamente

### 4.2 — Variáveis de ambiente

No serviço do backend → **Variables** → adicione cada variável:

```
MP_ACCESS_TOKEN    = TEST-seu-token-do-mercado-pago
ADMIN_SECRET       = uma-senha-forte-para-o-admin
WEBHOOK_SECRET     = qualquer-string-longa-aleatoria
FRONTEND_URL       = https://kaiooura.github.io/clothing-site
BACKEND_URL        = https://seu-app.up.railway.app
RESEND_API_KEY     = re_sua-chave-do-resend
PORT               = 3001
DATABASE_URL       = (adicionar via "Add Reference" → PostgreSQL → DATABASE_URL)
```

> **ADMIN_SECRET** é a senha do painel admin. Guarde bem — não tem recuperação.

### 4.3 — URL do backend

1. No serviço → **Settings** → **Domains** → **Generate Domain**
2. Copie a URL (ex: `https://clothing-site-production.up.railway.app`)
3. Atualize a variável `BACKEND_URL` com esse endereço

---

## PASSO 5 — Configurar Webhook do Mercado Pago

O webhook avisa o backend quando um pagamento é processado — **essencial** para criar pedidos.

1. Acesse https://mercadopago.com.br/developers/panel
2. Abra sua aplicação → **Webhooks** → **Adicionar**
3. URL: `https://seu-app.up.railway.app/webhook/mercadopago`
4. Eventos: marque **"Pagamentos"**
5. Salve e copie o **Webhook Secret** gerado
6. Atualize a variável `WEBHOOK_SECRET` no Railway

---

## PASSO 6 — Atualizar FRONTEND_URL no Railway

Após o GitHub Pages gerar a URL do frontend:

1. Railway → backend → **Variables**
2. Atualize `FRONTEND_URL = https://kaiooura.github.io/clothing-site`
3. O Railway reinicia automaticamente

---

## Como funciona o fluxo de checkout

```
Cliente preenche dados → clica "Confirmar e pagar"
        ↓
Backend cria uma sessão temporária (sem tocar no estoque)
        ↓
Cliente é redirecionado para o Mercado Pago
        ↓
┌─────────────────────────────────────────────┐
│  Voltou sem pagar  │  Formulário e sacola   │
│  (clicou voltar)   │  são restaurados       │
├─────────────────────────────────────────────┤
│  Pagamento         │  Webhook cria pedido + │
│  aprovado          │  decrementa estoque    │
├─────────────────────────────────────────────┤
│  Boleto/Pix        │  Webhook cria pedido   │
│  pendente          │  + decrementa estoque  │
├─────────────────────────────────────────────┤
│  Pagamento         │  Webhook cria pedido   │
│  recusado          │  como recusado (sem    │
│                    │  mexer no estoque)     │
└─────────────────────────────────────────────┘
        ↓
Sessão abandonada sem pagamento → limpa automaticamente em 15 min
Boleto expirado sem pagamento  → estoque restaurado após 4 dias
```

---

## Painel Administrativo

### Acessar

1. Abra o site → clique em **Admin** (canto superior direito)
2. Digite o `ADMIN_SECRET` configurado no Railway

### Produtos

| Campo | Descrição |
|---|---|
| Nome | Nome da peça |
| Subtítulo | Material, cor, etc. |
| Imagens | URLs diretas (Imgur, Drive público) — uma por linha |
| Tamanho | Tamanho único da peça (ex: M, 38, PP) |
| Preço / De | Preço atual e original (se em promoção) |
| Tag | Rótulo exibido no card (Novo, Sale, Exclusivo...) |
| Estoque | 0 = esgotado, 1 = disponível (brechó: itens únicos) |

> Se um item aparecer como **Esgotado** incorretamente, use o botão **Restaurar** ao lado do produto no painel.

### Pedidos — Status

| Status | Significado |
|---|---|
| Recebido | Pedido criado |
| Confirmado | Pagamento aprovado |
| Despachado | Enviado para transportadora |
| Em trânsito | A caminho do cliente |
| Entregue | Concluído |

---

## Testando pagamentos (Sandbox)

1. Use o Access Token de **Sandbox** (`TEST-...`) no Railway
2. Cartões de teste do Mercado Pago:

| Cenário | Número | CVV | Validade |
|---|---|---|---|
| Aprovado | 5031 4332 1540 6351 | 123 | 11/25 |
| Recusado | 4000 0000 0000 0002 | 123 | 11/25 |

3. Para Pix/boleto no sandbox: simule o pagamento no painel de developers

---

## Ir para produção

1. No Mercado Pago, vá em **Credenciais de produção** e copie o Access Token real
2. No Railway, atualize `MP_ACCESS_TOKEN` com o token de produção (`APP_USR-...`)
3. Atualize o `WEBHOOK_SECRET` com o valor gerado pelo MP em produção
4. Publique o frontend via GitHub Desktop

---

## Manutenção e atualizações

### Publicar mudanças no frontend
Abra o **GitHub Desktop** → selecione `clothing-site` → commit + push para `main`.
O GitHub Pages atualiza automaticamente em ~1 minuto.

### Publicar mudanças no backend
Abra o **GitHub Desktop** → selecione `clothing-site-backend` → commit + push para `main`.
O Railway detecta e faz redeploy automaticamente em ~2 minutos.

### Banco de dados
O banco é gerenciado pelo Railway. As migrações rodam automaticamente ao iniciar o servidor.
Para acessar o banco diretamente: Railway → PostgreSQL → **Connect** → use o cliente de sua preferência.

---

## Suporte

Se travar em algum passo, guarde a mensagem de erro exata.
Documentação oficial:
- Railway: https://docs.railway.app
- Mercado Pago: https://www.mercadopago.com.br/developers/pt/docs
- Resend: https://resend.com/docs
