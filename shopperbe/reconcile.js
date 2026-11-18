const { Pool } = require('pg');
require('dotenv').config({ path: '/var/www/shoopp/shopperbe/.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  console.log('=== HISTORICAL ORDER & VENDOR FINANCIAL AUDIT ===');
  
  // 1. All Vendors
  const vendors = await pool.query('SELECT id, name, store_name, email, phone, wallet_balance, COALESCE(outstanding_debt, 0) as outstanding_debt, bank_verification_status, bank_account_number FROM vendors ORDER BY id');
  console.log('\n--- VENDORS ---');
  console.log(JSON.stringify(vendors.rows, null, 2));

  // 2. All Vendor Subscriptions
  const subs = await pool.query('SELECT * FROM vendor_subscriptions ORDER BY created_at DESC');
  console.log('\n--- VENDOR SUBSCRIPTIONS ---');
  console.log(JSON.stringify(subs.rows, null, 2));

  // 3. All Orders
  const orders = await pool.query('SELECT id, order_number, total, status, items, created_at FROM orders ORDER BY id');
  console.log('\n--- ORDERS ---');
  for (const o of orders.rows) {
    console.log(`Order #${o.id} (${o.order_number}) - Status: ${o.status} - Total: ${o.total} - Items:`, JSON.stringify(o.items));
  }

  // 4. All Vendor Transactions
  const txs = await pool.query('SELECT * FROM vendor_transactions ORDER BY id');
  console.log('\n--- VENDOR TRANSACTIONS ---');
  console.log(JSON.stringify(txs.rows, null, 2));

  // 5. Vendor Order Payouts
  const payouts = await pool.query('SELECT * FROM vendor_order_payouts ORDER BY id');
  console.log('\n--- VENDOR ORDER PAYOUTS ---');
  console.log(JSON.stringify(payouts.rows, null, 2));

  await pool.end();
}

run().catch(console.error);

