const pool = require('./db');
async function run() {
  const orders = await pool.query("SELECT id, items FROM orders");
  for (const order of orders.rows) {
    let items = [];
    try { items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch(e) {}
    let updated = false;
    for (let item of items) {
      if (item.product && item.product.id && !item.product.vendor_id) {
        const p = await pool.query("SELECT vendor_id FROM products WHERE id = $1", [item.product.id]);
        if (p.rows.length > 0 && p.rows[0].vendor_id) {
          item.product.vendor_id = p.rows[0].vendor_id;
          updated = true;
        }
      }
    }
    if (updated) {
      await pool.query("UPDATE orders SET items = $1 WHERE id = $2", [JSON.stringify(items), order.id]);
      console.log(`Updated order ${order.id}`);
    }
  }
  console.log('Done!');
  process.exit(0);
}
run();
