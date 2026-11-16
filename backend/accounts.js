const bcrypt = require('bcryptjs');
const db = require('./db');

const ACCOUNT_DEFINITIONS = [
  { key: 'OWNER', role: 'Owner / Manager' },
  { key: 'CASHIER', role: 'Cashier / Service Staff' },
  { key: 'KITCHEN', role: 'Kitchen Personnel' }
];

const LEGACY_DEMO_EMAILS = [
  'admin@cafemunaco.local',
  'cashier@cafemunaco.local',
  'kitchen@cafemunaco.local'
];

function getConfiguredAccounts() {
  const accounts = ACCOUNT_DEFINITIONS.map(definition => ({
    ...definition,
    name: String(process.env[`${definition.key}_NAME`] || '').trim(),
    email: String(process.env[`${definition.key}_EMAIL`] || '').trim().toLowerCase(),
    password: String(process.env[`${definition.key}_PASSWORD`] || '')
  }));

  const missing = [];
  for (const account of accounts) {
    if (!account.name) missing.push(`${account.key}_NAME`);
    if (!account.email) missing.push(`${account.key}_EMAIL`);
    if (!account.password) missing.push(`${account.key}_PASSWORD`);
  }
  if (missing.length) {
    throw new Error(`Missing account settings: ${missing.join(', ')}. Add them to backend/.env.`);
  }

  for (const account of accounts) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email)) {
      throw new Error(`${account.key}_EMAIL must be a valid email address.`);
    }
    if (account.password.length < 8) {
      throw new Error(`${account.key}_PASSWORD must be at least 8 characters long.`);
    }
  }

  if (new Set(accounts.map(account => account.email)).size !== accounts.length) {
    throw new Error('OWNER_EMAIL, CASHIER_EMAIL, and KITCHEN_EMAIL must be different.');
  }

  return accounts;
}

async function ensureConfiguredAccounts() {
  const accounts = getConfiguredAccounts();
  const legacyPlaceholders = LEGACY_DEMO_EMAILS.map(() => '?').join(',');

  for (const account of accounts) {
    const passwordHash = await bcrypt.hash(account.password, 12);
    const [byEmail] = await db.execute('SELECT id FROM users WHERE email=? LIMIT 1', [account.email]);

    if (byEmail.length) {
      await db.execute(
        'UPDATE users SET name=?, email=?, password_hash=?, role=?, is_active=1 WHERE id=?',
        [account.name, account.email, passwordHash, account.role, byEmail[0].id]
      );
      continue;
    }

    const [legacy] = await db.execute(
      `SELECT id FROM users WHERE role=? AND email IN (${legacyPlaceholders}) ORDER BY id LIMIT 1`,
      [account.role, ...LEGACY_DEMO_EMAILS]
    );

    if (legacy.length) {
      await db.execute(
        'UPDATE users SET name=?, email=?, password_hash=?, role=?, is_active=1 WHERE id=?',
        [account.name, account.email, passwordHash, account.role, legacy[0].id]
      );
      continue;
    }

    await db.execute(
      'INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, 1)',
      [account.name, account.email, passwordHash, account.role]
    );
  }

  const configuredPlaceholders = accounts.map(() => '?').join(',');
  await db.query(
    `UPDATE users SET is_active=0 WHERE email IN (${legacyPlaceholders}) AND email NOT IN (${configuredPlaceholders})`,
    [...LEGACY_DEMO_EMAILS, ...accounts.map(account => account.email)]
  );

  return accounts;
}

module.exports = { ensureConfiguredAccounts, getConfiguredAccounts };
