require('dotenv').config();
const db = require('./db');
const { ensureConfiguredAccounts } = require('./accounts');

(async () => {
  try {
    const accounts = await ensureConfiguredAccounts();
    console.log('Login accounts are ready:');
    for (const account of accounts) {
      console.log(`${account.role}: ${account.email}`);
    }
    console.log('Credentials are configured in backend/.env.');
  } catch (error) {
    console.error('Unable to prepare login accounts:', error.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
