const pool = require('./db');

async function backfill() {
  try {
    const ordersRes = await pool.query('SELECT * FROM orders');
    for (const order of ordersRes.rows) {
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
        // Check if exists
        const check = await pool.query('SELECT id FROM vendor_order_payouts WHERE order_id = $1 AND vendor_id = $2', [order.id, vid]);
        if (check.rows.length === 0) {
          await pool.query(
            'INSERT INTO vendor_order_payouts (order_id, vendor_id, amount, status) VALUES ($1, $2, $3, $4)',
            [order.id, vid, total, 'pending']
          );
          console.log(`Added payout for order ${order.id}, vendor ${vid}`);
        }
      }
    }
    console.log('Backfill complete.');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

backfill();
