const pool = require('./db');
async function run() {
  const orders = await pool.query("SELECT id, order_number, items FROM orders");
  for (const order of orders.rows) {
    let items = [];
    try { items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []); } catch(e) {}
    
    const vendorData = {};
    for (const item of items) {
      if (item.product && item.product.vendor_id) {
        const vid = item.product.vendor_id;
        const amt = item.qty * (item.variant?.price || item.product?.price || 0);
        if (!vendorData[vid]) vendorData[vid] = 0;
        vendorData[vid] += amt;
      }
    }
    
    for (const [vid, total] of Object.entries(vendorData)) {
      // Check if transaction already exists
      const tx = await pool.query("SELECT id FROM vendor_transactions WHERE order_number = $1 AND vendor_id = $2", [order.order_number, vid]);
      if (tx.rows.length === 0) {
        // Doesn't exist, so add it
        await pool.query('UPDATE vendors SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2', [total, vid]);
        await pool.query(
          'INSERT INTO vendor_transactions (vendor_id, type, amount, order_number, description) VALUES ($1, $2, $3, $4, $5)',
          [vid, 'credit', total, order.order_number, `Order sale: ${order.order_number}`]
        );
        console.log(`Credited vendor ${vid} with ${total} for order ${order.order_number}`);
      }
    }
  }
  console.log('Done!');
  process.exit(0);
}
run();
