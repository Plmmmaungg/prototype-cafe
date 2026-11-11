CREATE DATABASE IF NOT EXISTS cafe_munaco_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cafe_munaco_db;
SET FOREIGN_KEY_CHECKS=0;
DROP TABLE IF EXISTS waste_records,stock_movements,order_items,orders,reservations,inventory,promos,products,activity_logs,users;
SET FOREIGN_KEY_CHECKS=1;

CREATE TABLE users(
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('Owner / Manager','Cashier / Service Staff','Kitchen Personnel','Inventory Personnel') NOT NULL DEFAULT 'Cashier / Service Staff',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE products(
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(80) NOT NULL,
  description TEXT,
  image_url LONGTEXT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  available TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE promos(
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

CREATE TABLE inventory(
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_name VARCHAR(150) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Other Supplies',
  unit VARCHAR(30) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
  minimum_stock DECIMAL(12,3) NOT NULL DEFAULT 0,
  purchase_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  expiration_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inventory_stock(quantity,minimum_stock)
) ENGINE=InnoDB;

CREATE TABLE orders(
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(30) NOT NULL UNIQUE,
  customer_name VARCHAR(150) NOT NULL,
  order_type ENUM('Dine-in','Takeout','Advance Order','Event') NOT NULL DEFAULT 'Dine-in',
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  promo_id INT NULL,
  promo_name VARCHAR(150) NULL,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method ENUM('Cash','GCash','Card') NOT NULL DEFAULT 'Cash',
  amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
  change_due DECIMAL(10,2) NOT NULL DEFAULT 0,
  status ENUM('Pending','Confirmed','Preparing','Ready','Completed','Cancelled') NOT NULL DEFAULT 'Pending',
  special_instructions TEXT,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(created_by) REFERENCES users(id),
  FOREIGN KEY(promo_id) REFERENCES promos(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE order_items(
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  product_name VARCHAR(150) NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE reservations(
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(150) NOT NULL,
  contact_number VARCHAR(40),
  reservation_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NULL,
  guests INT NOT NULL,
  event_type VARCHAR(80) NOT NULL DEFAULT 'Regular Dining',
  table_arrangement VARCHAR(100),
  special_requests TEXT,
  status ENUM('Pending','Confirmed','Arrived','Completed','Cancelled','No-show') NOT NULL DEFAULT 'Pending',
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(created_by) REFERENCES users(id),
  INDEX idx_reservation_date(reservation_date,status)
) ENGINE=InnoDB;

CREATE TABLE stock_movements(
  id INT AUTO_INCREMENT PRIMARY KEY,
  inventory_id INT NOT NULL,
  user_id INT NOT NULL,
  movement_type ENUM('Stock In','Stock Out','Waste') NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  previous_quantity DECIMAL(12,3) NOT NULL,
  new_quantity DECIMAL(12,3) NOT NULL,
  reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(inventory_id) REFERENCES inventory(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE waste_records(
  id INT AUTO_INCREMENT PRIMARY KEY,
  inventory_id INT NOT NULL,
  user_id INT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  category VARCHAR(80) NOT NULL,
  reason TEXT,
  estimated_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(inventory_id) REFERENCES inventory(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE activity_logs(
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(120) NOT NULL,
  module VARCHAR(80) NOT NULL,
  record_id VARCHAR(60),
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_activity_created(created_at)
) ENGINE=InnoDB;

INSERT INTO products(name,category,description,price) VALUES
('Cafe Munaco Signature Latte','Coffee','Espresso with smooth steamed milk.',145),
('Spanish Iced Latte','Coffee','Bold espresso with creamy milk.',155),
('Caramel Macchiato','Coffee','Vanilla, espresso and caramel.',165),
('Classic Cheesecake','Desserts','Creamy baked cheesecake slice.',175),
('Seafood Pasta','Main Course','Creamy pasta with seafood.',285),
('Chicken Alfredo','Main Course','Creamy parmesan chicken pasta.',245);

INSERT INTO promos(name,description,discount_type,discount_value,product_id,starts_at,expires_at,is_active) VALUES
('Happy Hour','10% off every order during the afternoon rush.','Percent',10,NULL,NOW(),DATE_ADD(NOW(), INTERVAL 7 DAY),1),
('Latte Lover','15% off the Cafe Munaco Signature Latte.','Percent',15,1,NOW(),DATE_ADD(NOW(), INTERVAL 3 DAY),1),
('Sweet Treat','₱25 off a slice of Classic Cheesecake.','Fixed',25,4,NOW(),DATE_ADD(NOW(), INTERVAL 5 DAY),1),
('Weekend Special','10% off all coffee orders.','Percent',10,NULL,DATE_SUB(NOW(), INTERVAL 4 DAY),DATE_SUB(NOW(), INTERVAL 1 DAY),1);

INSERT INTO inventory(item_name,category,unit,quantity,minimum_stock,purchase_cost,expiration_date) VALUES
('Coffee Beans','Beverages','kg',18,5,620,NULL),
('Fresh Milk','Dairy','liter',12,8,95,DATE_ADD(CURDATE(),INTERVAL 12 DAY)),
('Caramel Syrup','Dry Goods','bottle',7,2,180,NULL),
('Pasta','Dry Goods','kg',9,3,110,NULL),
('Seafood Mix','Seafood','kg',2,5,480,DATE_ADD(CURDATE(),INTERVAL 2 DAY)),
('Cream Cheese','Dairy','kg',4,2,390,DATE_ADD(CURDATE(),INTERVAL 20 DAY));
