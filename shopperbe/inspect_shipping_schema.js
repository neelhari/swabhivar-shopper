const pool = require('./db');

async function inspectSchema() {
  const client = await pool.connect();
  try {
    // Check columns of vendors
    const vendorCols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'vendors'
      ORDER BY ordinal_position
    `);
    console.log('--- VENDORS COLUMNS ---');
    console.log(vendorCols.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));

    // Check columns of orders
    const orderCols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'orders'
      ORDER BY ordinal_position
    `);
    console.log('\n--- ORDERS COLUMNS ---');
    console.log(orderCols.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));

    // Check if vendor_order_payouts or shipments or other tables exist
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('\n--- ALL TABLES ---');
    console.log(tables.rows.map(r => r.table_name).join(', '));

  } catch (err) {
    console.error('Error inspecting schema:', err);
  } finally {
    client.release();
    pool.end();
  }
}

inspectSchema();

