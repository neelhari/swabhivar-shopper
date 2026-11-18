const pool = require('./db');

async function updateAllProducts() {
  const res = await pool.query(`
    UPDATE products
    SET weight = COALESCE(NULLIF(weight, ''), '0.5'),
        length = COALESCE(NULLIF(length, ''), '20'),
        width = COALESCE(NULLIF(width, ''), '15'),
        height = COALESCE(NULLIF(height, ''), '5')
    WHERE weight IS NULL OR length IS NULL OR width IS NULL OR height IS NULL OR weight = '' OR length = ''
    RETURNING id, name, weight, length, width, height
  `);
  console.log(`Updated ${res.rowCount} products with valid courier dimensions.`);

  const vRes = await pool.query(`
    UPDATE vendors
    SET pickup_contact_name = COALESCE(pickup_contact_name, 'Kancharla Hemanth'),
        pickup_phone = COALESCE(pickup_phone, '9876543210'),
        pickup_address_line1 = COALESCE(pickup_address_line1, 'BTM Layout 2nd Stage'),
        pickup_city = COALESCE(pickup_city, 'Bengaluru'),
        pickup_state = COALESCE(pickup_state, 'Karnataka'),
        pickup_pincode = COALESCE(pickup_pincode, '560076'),
        shiprocket_pickup_name = COALESCE(shiprocket_pickup_name, 'vnd_1_560076')
    WHERE id = 1
    RETURNING id, name, pickup_pincode
  `);
  console.log(`Updated vendor 1 pickup address:`, vRes.rows[0]);
  process.exit(0);
}

updateAllProducts().catch(e => { console.error(e); process.exit(1); });
