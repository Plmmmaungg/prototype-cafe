require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

const demoAccounts = [
  { name: 'Cafe Munaco Owner', email: 'admin@cafemunaco.local', password: 'CafeMunaco123!', role: 'Owner / Manager' },
  { name: 'Cafe Munaco Cashier', email: 'cashier@cafemunaco.local', password: 'Cashier123!', role: 'Cashier / Service Staff' },
  { name: 'Cafe Munaco Kitchen', email: 'kitchen@cafemunaco.local', password: 'Kitchen123!', role: 'Kitchen Personnel' }
];

(async () => {
  try {
    for (const account of demoAccounts) {
      const passwordHash = await bcrypt.hash(account.password, 12);
      await db.execute(
        `INSERT INTO users (name, email, password_hash, role, is_active)
         VALUES (?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE name=VALUES(name), password_hash=VALUES(password_hash), role=VALUES(role), is_active=1`,
        [account.name, account.email, passwordHash, account.role]
      );
    }
    console.log('Demo accounts are ready:');
    console.log('OWNER   admin@cafemunaco.local   / CafeMunaco123!');
    console.log('CASHIER cashier@cafemunaco.local / Cashier123!');
    console.log('KITCHEN kitchen@cafemunaco.local / Kitchen123!');
  } catch (error) {
    console.error('Unable to seed demo accounts:', error.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
