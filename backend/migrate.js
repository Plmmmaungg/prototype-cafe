require('dotenv').config();
const db = require('./db');

async function columnExists(table, column) {
  const [rows] = await db.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1',
    [table, column]
  );
  return rows.length > 0;
}

async function constraintExists(table, name) {
  const [rows] = await db.query(
    'SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=? LIMIT 1',
    [table, name]
  );
  return rows.length > 0;
}

async function addColumn(table, column, definition) {
  if (await columnExists(table, column)) return;
  await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`Added ${table}.${column}`);
}

(async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS promos(
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      description TEXT,
      discount_type ENUM('Percent','Fixed') NOT NULL DEFAULT 'Percent',
      discount_value DECIMAL(10,2) NOT NULL,
      product_id INT NULL,
      image_url LONGTEXT NULL,
      starts_at DATETIME NULL,
      expires_at DATETIME NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_promos_active(is_active, starts_at, expires_at)
    ) ENGINE=InnoDB
  `);

  await addColumn('products', 'image_url', 'LONGTEXT NULL AFTER `description`');
  await addColumn('orders', 'subtotal', 'DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER `order_type`');
  await addColumn('orders', 'discount_amount', 'DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER `subtotal`');
  await addColumn('orders', 'promo_id', 'INT NULL AFTER `discount_amount`');
  await addColumn('orders', 'promo_name', 'VARCHAR(150) NULL AFTER `promo_id`');
  await addColumn('orders', 'payment_method', "ENUM('Cash','GCash','Card') NOT NULL DEFAULT 'Cash' AFTER `total_amount`");
  await addColumn('orders', 'amount_paid', 'DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER `payment_method`');
  await addColumn('orders', 'change_due', 'DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER `amount_paid`');

  if (!(await constraintExists('orders', 'fk_orders_promo'))) {
    await db.query('ALTER TABLE orders ADD CONSTRAINT fk_orders_promo FOREIGN KEY (promo_id) REFERENCES promos(id) ON DELETE SET NULL');
    console.log('Added orders.fk_orders_promo');
  }

  const [[{ total }]] = await db.query('SELECT COUNT(*) total FROM promos');
  if (Number(total) === 0) {
    await db.query(`
      INSERT INTO promos(name,description,discount_type,discount_value,product_id,starts_at,expires_at,is_active) VALUES
      ('Happy Hour','10% off every order during the afternoon rush.','Percent',10,NULL,NOW(),DATE_ADD(NOW(), INTERVAL 7 DAY),1),
      ('Latte Lover','15% off the Cafe Munaco Signature Latte.','Percent',15,(SELECT id FROM products WHERE name='Cafe Munaco Signature Latte' LIMIT 1),NOW(),DATE_ADD(NOW(), INTERVAL 3 DAY),1),
      ('Sweet Treat','₱25 off a slice of Classic Cheesecake.','Fixed',25,(SELECT id FROM products WHERE name='Classic Cheesecake' LIMIT 1),NOW(),DATE_ADD(NOW(), INTERVAL 5 DAY),1)
    `);
    console.log('Added demo promos');
  }

  console.log('POS and promo schema is ready.');
  await db.end();
})().catch(async (error) => {
  console.error('Migration failed:', error.message);
  try { await db.end(); } catch {}
  process.exitCode = 1;
});
