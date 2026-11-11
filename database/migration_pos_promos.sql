-- Cafe Munaco POS + Promo migration
-- Run this once against an existing cafe_munaco_db database.
-- It is safe to run more than once: columns, table, constraint and demo promos are checked first.

USE cafe_munaco_db;
SET @db := DATABASE();
 
-- 1. Product images
SET @sql := (
  SELECT IF(COUNT(*)=0,
    'ALTER TABLE products ADD COLUMN image_url LONGTEXT NULL AFTER description',
    'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='products' AND COLUMN_NAME='image_url'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Promos
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
) ENGINE=InnoDB;

-- 3. POS checkout fields on orders
SET @sql := (SELECT IF(COUNT(*)=0,'ALTER TABLE orders ADD COLUMN subtotal DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER order_type','SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='orders' AND COLUMN_NAME='subtotal');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(COUNT(*)=0,'ALTER TABLE orders ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER subtotal','SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='orders' AND COLUMN_NAME='discount_amount');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(COUNT(*)=0,'ALTER TABLE orders ADD COLUMN promo_id INT NULL AFTER discount_amount','SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='orders' AND COLUMN_NAME='promo_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(COUNT(*)=0,'ALTER TABLE orders ADD COLUMN promo_name VARCHAR(150) NULL AFTER promo_id','SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='orders' AND COLUMN_NAME='promo_name');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(COUNT(*)=0,'ALTER TABLE orders ADD COLUMN payment_method ENUM(''Cash'',''GCash'',''Card'') NOT NULL DEFAULT ''Cash'' AFTER total_amount','SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='orders' AND COLUMN_NAME='payment_method');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(COUNT(*)=0,'ALTER TABLE orders ADD COLUMN amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER payment_method','SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='orders' AND COLUMN_NAME='amount_paid');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(COUNT(*)=0,'ALTER TABLE orders ADD COLUMN change_due DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER amount_paid','SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='orders' AND COLUMN_NAME='change_due');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(COUNT(*)=0,'ALTER TABLE orders ADD CONSTRAINT fk_orders_promo FOREIGN KEY (promo_id) REFERENCES promos(id) ON DELETE SET NULL','SELECT 1') FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=@db AND TABLE_NAME='orders' AND CONSTRAINT_NAME='fk_orders_promo');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Demo promos (only inserted when missing)
INSERT INTO promos(name,description,discount_type,discount_value,product_id,starts_at,expires_at,is_active)
SELECT 'Happy Hour','10% off every order during the afternoon rush.','Percent',10,NULL,NOW(),DATE_ADD(NOW(), INTERVAL 7 DAY),1
WHERE NOT EXISTS (SELECT 1 FROM promos WHERE name='Happy Hour');

INSERT INTO promos(name,description,discount_type,discount_value,product_id,starts_at,expires_at,is_active)
SELECT 'Latte Lover','15% off the Cafe Munaco Signature Latte.','Percent',15,(SELECT id FROM products WHERE name='Cafe Munaco Signature Latte' LIMIT 1),NOW(),DATE_ADD(NOW(), INTERVAL 3 DAY),1
WHERE NOT EXISTS (SELECT 1 FROM promos WHERE name='Latte Lover');

INSERT INTO promos(name,description,discount_type,discount_value,product_id,starts_at,expires_at,is_active)
SELECT 'Sweet Treat','₱25 off a slice of Classic Cheesecake.','Fixed',25,(SELECT id FROM products WHERE name='Classic Cheesecake' LIMIT 1),NOW(),DATE_ADD(NOW(), INTERVAL 5 DAY),1
WHERE NOT EXISTS (SELECT 1 FROM promos WHERE name='Sweet Treat');
