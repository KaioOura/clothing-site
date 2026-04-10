// server.js — Servidor principal MAISON·BR
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const { pool, initDB } = require('./db');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = 'MAISON·BR <onboarding@resend.dev>';

async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    await resend.emails.send({ from: EMAIL_FROM, to, subject, html });
  } catch (err) {
    console.error('Erro ao enviar e-mail:', err.message);
  }
}

function emailOrderCreated(order) {
  return sendEmail(order.customer_email, `Pedido ${order.order_number} recebido!`, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1C1C1A">
      <h2 style="color:#C4753A">Pedido recebido!</h2>
      <p>Olá, <strong>${order.customer_name}</strong>!</p>
      <p>Recebemos seu pedido <strong>${order.order_number}</strong> no valor de <strong>R$ ${Number(order.total).toFixed(2).replace('.', ',')}</strong>.</p>
      <p>Aguardamos a confirmação do pagamento. Você receberá um novo e-mail assim que for aprovado.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="font-size:12px;color:#888">MAISON·BR — Moda consciente</p>
    </div>
  `);
}

function emailOrderConfirmed(order) {
  return sendEmail(order.customer_email, `Pagamento confirmado — Pedido ${order.order_number}`, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1C1C1A">
      <h2 style="color:#C4753A">Pagamento confirmado!</h2>
      <p>Olá, <strong>${order.customer_name}</strong>!</p>
      <p>O pagamento do pedido <strong>${order.order_number}</strong> foi aprovado. Estamos preparando sua encomenda!</p>
      <p>Você receberá um novo e-mail quando o pedido for despachado.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="font-size:12px;color:#888">MAISON·BR — Moda consciente</p>
    </div>
  `);
}

function emailOrderDispatched(order) {
  const tracking = order.tracking_code
    ? `<p>Código de rastreio: <strong>${order.tracking_code}</strong></p><p><a href="https://www.correios.com.br/rastreamento" style="color:#C4753A">Rastrear pelos Correios</a></p>`
    : '';
  return sendEmail(order.customer_email, `Pedido ${order.order_number} despachado!`, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1C1C1A">
      <h2 style="color:#C4753A">Pedido a caminho!</h2>
      <p>Olá, <strong>${order.customer_name}</strong>!</p>
      <p>Seu pedido <strong>${order.order_number}</strong> foi despachado.</p>
      ${tracking}
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="font-size:12px;color:#888">MAISON·BR — Moda consciente</p>
    </div>
  `);
}

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Mercado Pago ─────────────────────────────────────────────────────────────
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// ─── Middlewares ──────────────────────────────────────────────────────────────

// Cabeçalhos de segurança HTTP
app.use(helmet());

// CORS — FRONTEND_URL deve estar definido em produção
if (!process.env.FRONTEND_URL) {
  console.warn('⚠️  FRONTEND_URL não definido — CORS está aberto para todas origens (inseguro em produção)');
}
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

// Webhook precisa do body raw para validação de assinatura
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Rate limiting no login — evita força bruta
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,                   // máx. 10 tentativas
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

// Middleware que protege rotas administrativas via Bearer token
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  const token = auth.slice(7);
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    console.error('ADMIN_SECRET não configurado nas variáveis de ambiente');
    return res.status(500).json({ error: 'Servidor mal configurado' });
  }
  const tokenBuf  = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  if (tokenBuf.length !== secretBuf.length || !crypto.timingSafeEqual(tokenBuf, secretBuf)) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  next();
}

// POST /api/admin/login — valida senha e retorna token
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { password } = req.body;
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Servidor mal configurado' });
  }
  if (!password || password.length !== secret.length ||
      !crypto.timingSafeEqual(Buffer.from(password), Buffer.from(secret))) {
    return res.status(401).json({ error: 'Senha incorreta' });
  }
  res.json({ token: secret });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateOrderNumber() {
  const date = new Date();
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `MB${yy}${mm}${dd}-${rand}`;
}

async function updateOrderStatus(orderId, status, note = null) {
  await pool.query(
    `UPDATE orders SET order_status = $1, updated_at = NOW() WHERE id = $2`,
    [status, orderId]
  );
  await pool.query(
    `INSERT INTO order_status_history (order_id, status, note) VALUES ($1, $2, $3)`,
    [orderId, status, note]
  );
}

// ─── ROTAS: PRODUTOS ─────────────────────────────────────────────────────────

// GET /api/products — lista todos os produtos ativos
app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM products WHERE active = true ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

// POST /api/products — cria produto (admin)
app.post('/api/products', requireAdmin, async (req, res) => {
  const { name, subtitle, emoji, bg_color, price, old_price, tag, is_new, is_sale, description, sizes, colors, details } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO products (name, subtitle, emoji, bg_color, price, old_price, tag, is_new, is_sale, description, sizes, colors, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [name, subtitle, emoji, bg_color, price, old_price || null, tag || null, is_new, is_sale, description, sizes, colors, details]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar produto' });
  }
});

// PUT /api/products/:id — atualiza produto (admin)
app.put('/api/products/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, subtitle, emoji, bg_color, price, old_price, tag, is_new, is_sale, description, sizes, colors, details, active } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE products SET name=$1, subtitle=$2, emoji=$3, bg_color=$4, price=$5, old_price=$6,
       tag=$7, is_new=$8, is_sale=$9, description=$10, sizes=$11, colors=$12, details=$13, active=$14
       WHERE id=$15 RETURNING *`,
      [name, subtitle, emoji, bg_color, price, old_price || null, tag || null, is_new, is_sale, description, sizes, colors, details, active, id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
});

// DELETE /api/products/:id — desativa produto (soft delete)
app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query(`UPDATE products SET active = false WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover produto' });
  }
});

// ─── ROTAS: PEDIDOS ───────────────────────────────────────────────────────────

// POST /api/orders — cria pedido e preference do Mercado Pago
app.post('/api/orders', async (req, res) => {
  const {
    customer_name, customer_email, customer_phone,
    address_zip, address_street, address_city, address_state,
    items, subtotal, discount, shipping, coupon_discount, total,
    payment_method,
  } = req.body;

  if (!customer_name || !customer_email || !items?.length) {
    return res.status(400).json({ error: 'Dados obrigatórios ausentes' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const order_number = generateOrderNumber();

    const { rows } = await client.query(
      `INSERT INTO orders
         (order_number, customer_name, customer_email, customer_phone,
          address_zip, address_street, address_city, address_state,
          items, subtotal, discount, shipping, coupon_discount, total,
          payment_method, payment_status, order_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending','received')
       RETURNING *`,
      [order_number, customer_name, customer_email, customer_phone,
       address_zip, address_street, address_city, address_state,
       JSON.stringify(items), subtotal, discount, shipping, coupon_discount, total,
       payment_method]
    );
    const order = rows[0];

    // Registra primeiro status no histórico
    await client.query(
      `INSERT INTO order_status_history (order_id, status, note) VALUES ($1, 'received', 'Pedido criado')`,
      [order.id]
    );

    // Cria preference no Mercado Pago
    const preferencePayload = {
      items: items.map(item => ({
        id:          String(item.id),
        title:       item.name,
        quantity:    item.qty,
        unit_price:  Number(item.price),
        currency_id: 'BRL',
      })),
      payer: {
        name:  customer_name,
        email: customer_email,
      },
      back_urls: {
        success: `${process.env.FRONTEND_URL}/?order=${order_number}&status=success`,
        failure: `${process.env.FRONTEND_URL}/?order=${order_number}&status=failure`,
        pending: `${process.env.FRONTEND_URL}/?order=${order_number}&status=pending`,
      },
      auto_return:          'approved',
      notification_url:     `${process.env.BACKEND_URL}/webhook/mercadopago`,
      external_reference:   order_number,
      statement_descriptor: 'MAISONBR',
      payment_methods: {
        excluded_payment_types: payment_method === 'pix'
          ? [{ id: 'credit_card' }, { id: 'debit_card' }, { id: 'ticket' }]
          : payment_method === 'boleto'
          ? [{ id: 'credit_card' }, { id: 'debit_card' }]
          : [],
        installments: 12,
      },
    };

    const preferenceApi = new Preference(mpClient);
    const mpPreference  = await preferenceApi.create({ body: preferencePayload });

    // Salva o preference_id no pedido
    await client.query(
      `UPDATE orders SET mp_preference_id = $1 WHERE id = $2`,
      [mpPreference.id, order.id]
    );

    await client.query('COMMIT');

    emailOrderCreated(order);

    res.status(201).json({
      order_number,
      order_id: order.id,
      mp_preference_id:  mpPreference.id,
      mp_init_point:     mpPreference.init_point,     // redirect para pagar
      mp_sandbox_init_point: mpPreference.sandbox_init_point,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar pedido:', err);
    res.status(500).json({ error: 'Erro ao criar pedido' });
  } finally {
    client.release();
  }
});

// GET /api/orders/:orderNumber — busca pedido por número
app.get('/api/orders/:orderNumber', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM orders WHERE order_number = $1`,
      [req.params.orderNumber]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pedido não encontrado' });

    const order = rows[0];
    const { rows: history } = await pool.query(
      `SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC`,
      [order.id]
    );
    res.json({ ...order, history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar pedido' });
  }
});

// GET /api/admin/orders — lista todos os pedidos (admin)
app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM orders ORDER BY created_at DESC LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar pedidos' });
  }
});

// PATCH /api/admin/orders/:orderNumber/status — atualiza status do pedido (admin)
app.patch('/api/admin/orders/:orderNumber/status', requireAdmin, async (req, res) => {
  const { status, note, tracking_code } = req.body;
  const VALID_STATUSES = ['received', 'pending', 'confirmed', 'dispatched', 'in_transit', 'delivered'];
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id FROM orders WHERE order_number = $1`, [req.params.orderNumber]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pedido não encontrado' });

    const orderId = rows[0].id;
    await updateOrderStatus(orderId, status, note);

    if (tracking_code) {
      await pool.query(`UPDATE orders SET tracking_code = $1 WHERE id = $2`, [tracking_code, orderId]);
    }

    if (status === 'dispatched') {
      const { rows: orderRows } = await pool.query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
      if (orderRows.length) emailOrderDispatched(orderRows[0]);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

// ─── WEBHOOK: MERCADO PAGO ────────────────────────────────────────────────────
app.post('/webhook/mercadopago', async (req, res) => {
  // Verificação de assinatura HMAC-SHA256 do Mercado Pago
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (webhookSecret) {
    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];
    if (!xSignature) {
      console.warn('Webhook rejeitado: sem x-signature');
      return res.sendStatus(401);
    }
    const sigParts = {};
    xSignature.split(',').forEach(part => {
      const [k, ...rest] = part.trim().split('=');
      if (k && rest.length) sigParts[k] = rest.join('=');
    });
    const { ts, v1 } = sigParts;
    const rawStr  = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
    const parsedBody = JSON.parse(rawStr);
    const dataId  = parsedBody?.data?.id ?? req.query?.['data.id'];
    if (!dataId || !ts || !xRequestId) {
      return res.sendStatus(200); // ignora notificações sem dados suficientes para validar
    }
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const expected = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex');
    console.log('Webhook debug — manifest:', manifest);
    console.log('Webhook debug — expected:', expected);
    console.log('Webhook debug — received:', v1);
    if (!v1 || expected.length !== v1.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))) {
      console.warn('Webhook rejeitado: assinatura inválida');
      return res.sendStatus(401);
    }
  }

  try {
    const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;

    // Só processa notificação de pagamento
    if (body.type !== 'payment') {
      return res.sendStatus(200);
    }

    const paymentApi = new Payment(mpClient);
    const payment    = await paymentApi.get({ id: body.data.id });

    const orderNumber = payment.external_reference;
    if (!orderNumber) return res.sendStatus(200);

    const { rows } = await pool.query(
      `SELECT * FROM orders WHERE order_number = $1`, [orderNumber]
    );
    if (!rows.length) return res.sendStatus(200);

    const order = rows[0];

    // Mapeia status do MP → status do pedido
    let paymentStatus = 'pending';
    let orderStatus   = order.order_status;

    if (payment.status === 'approved') {
      paymentStatus = 'approved';
      orderStatus   = 'confirmed';
    } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
      paymentStatus = 'rejected';
      orderStatus   = 'pending';
    } else if (payment.status === 'in_process' || payment.status === 'pending') {
      paymentStatus = 'pending';
    }

    await pool.query(
      `UPDATE orders SET payment_status=$1, mp_payment_id=$2, updated_at=NOW() WHERE id=$3`,
      [paymentStatus, String(payment.id), order.id]
    );

    if (orderStatus !== order.order_status) {
      await updateOrderStatus(
        order.id,
        orderStatus,
        `Pagamento ${payment.status} via Mercado Pago (ID: ${payment.id})`
      );
      if (orderStatus === 'confirmed') {
        emailOrderConfirmed(order);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Erro no webhook:', err);
    res.sendStatus(500);
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// ─── INICIALIZAÇÃO ────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`   Frontend esperado em: ${process.env.FRONTEND_URL}`);
    console.log(`   Backend URL:          ${process.env.BACKEND_URL}`);
  });
}).catch(err => {
  console.error('❌ Falha ao iniciar:', err);
  process.exit(1);
});
