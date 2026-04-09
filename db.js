// db.js — Conexão e criação das tabelas
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        subtitle    VARCHAR(255),
        emoji       VARCHAR(10)  DEFAULT '👗',
        bg_color    VARCHAR(20)  DEFAULT '#E8DFDA',
        price       NUMERIC(10,2) NOT NULL,
        old_price   NUMERIC(10,2),
        tag         VARCHAR(50),
        is_new      BOOLEAN DEFAULT false,
        is_sale     BOOLEAN DEFAULT false,
        description TEXT,
        sizes       VARCHAR(255) DEFAULT 'P,M,G,GG',
        colors      VARCHAR(500) DEFAULT '#C4753A',
        details     TEXT,
        active      BOOLEAN DEFAULT true,
        created_at  TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id              SERIAL PRIMARY KEY,
        order_number    VARCHAR(20) UNIQUE NOT NULL,
        customer_name   VARCHAR(255) NOT NULL,
        customer_email  VARCHAR(255) NOT NULL,
        customer_phone  VARCHAR(50),
        address_zip     VARCHAR(20),
        address_street  VARCHAR(500),
        address_city    VARCHAR(255),
        address_state   VARCHAR(100),
        items           JSONB NOT NULL,
        subtotal        NUMERIC(10,2) NOT NULL,
        discount        NUMERIC(10,2) DEFAULT 0,
        shipping        NUMERIC(10,2) DEFAULT 0,
        coupon_discount NUMERIC(10,2) DEFAULT 0,
        total           NUMERIC(10,2) NOT NULL,
        payment_method  VARCHAR(50),
        payment_status  VARCHAR(50) DEFAULT 'pending',
        mp_payment_id   VARCHAR(255),
        mp_preference_id VARCHAR(255),
        order_status    VARCHAR(50) DEFAULT 'received',
        tracking_code   VARCHAR(100),
        notes           TEXT,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS order_status_history (
        id          SERIAL PRIMARY KEY,
        order_id    INTEGER REFERENCES orders(id),
        status      VARCHAR(50) NOT NULL,
        note        TEXT,
        created_at  TIMESTAMP DEFAULT NOW()
      );
    `);

    // Seed de produtos iniciais se a tabela estiver vazia
    const { rowCount } = await client.query('SELECT id FROM products LIMIT 1');
    if (rowCount === 0) {
      await client.query(`
        INSERT INTO products (name, subtitle, emoji, bg_color, price, old_price, tag, is_new, is_sale, description, sizes, colors, details)
        VALUES
          ('Vestido Linho Natural','Off-white · Linho 100%','👗','#E8DFDA',389,NULL,'Novo',true,false,'Um vestido fluido e elegante em linho 100% orgânico.','P,M,G,GG','#F5F0E8,#C4B9A8,#8A7968','Material:Linho 100% orgânico|Cuidados:Lavar à mão|Origem:Brasil'),
          ('Blazer Oversized','Cinza · Alfaiataria','🧥','#D6DDE5',479,620,'Sale',false,true,'Blazer de alfaiataria com caimento oversized.','P,M,G','#9AA5AE,#4A4E52,#C8B89A','Material:79% Poliéster 21% Viscose|Cuidados:Limpeza a seco|Origem:Brasil'),
          ('Calça Pantacourt','Verde Sage · Viscose','👖','#DDE5DA',295,NULL,NULL,true,false,'Calça pantacourt em viscose com caimento amplo.','36,38,40,42,44','#8FA688,#C4A882,#4A3728','Material:95% Viscose 5% Elastano|Cuidados:Ciclo delicado|Origem:Brasil'),
          ('Camisa Slip Seda','Terracota · Seda natural','👚','#E5DDD6',519,NULL,'Exclusivo',true,false,'Camisa estilo slip em seda natural com acabamento luxuoso.','P,M,G,GG','#C4753A,#F5E6D0,#2C1810','Material:100% Seda natural|Cuidados:Lavar à mão|Origem:Brasil'),
          ('Saia Midi Plissada','Preto · Crepe','👘','#D8D4D0',260,340,'Sale',false,true,'Saia midi plissada em crepe, elegante e versátil.','P,M,G','#2C2C2A,#888780,#C4B9A8','Material:100% Crepe|Cuidados:Lavar à mão|Origem:Brasil');
      `);
      console.log('✅ Produtos iniciais inseridos');
    }

    console.log('✅ Banco de dados inicializado com sucesso');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
