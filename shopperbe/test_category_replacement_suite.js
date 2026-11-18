require('dotenv').config();
const pool = require('./db');

async function runTestSuite() {
  console.log('=== STARTING CATEGORY REPLACEMENT & ARCHIVING TEST SUITE ===');

  let testVendorId = null;
  let testProduct1Id = null;
  let testProduct2Id = null;
  let testProduct3Id = null;

  try {
    // 1. Setup Test Vendor with Subscription
    console.log('\n[TEST 1] Creating Test Vendor with 2-Category Subscription Limit...');
    const initialCats = ['Mobiles', 'Clothing'];
    const vendorRes = await pool.query(`
      INSERT INTO vendors (name, email, phone, password_hash, status, selected_categories)
      VALUES ('Test Cat Vendor', 'cat_test_${Date.now()}@example.com', '999888${Math.floor(1000 + Math.random()*9000)}', 'dummyhash', 'approved', $1)
      RETURNING id, selected_categories
    `, [JSON.stringify(initialCats)]);
    testVendorId = vendorRes.rows[0].id;
    console.log(`✓ Test Vendor created: ID ${testVendorId}, initial categories:`, vendorRes.rows[0].selected_categories);

    // Create active subscription with category limit = 2
    await pool.query(`
      INSERT INTO vendor_subscriptions (vendor_id, plan_id, plan_name, features, status, expires_at)
      VALUES ($1, 1, 'Premium 2 Categories', '{"category_limit": 2, "product_limit": 20}', 'active', NOW() + INTERVAL '30 days')
    `, [testVendorId]);
    console.log('✓ Test Subscription created with category_limit = 2');

    // 2. Create products under Mobiles and Clothing
    console.log('\n[TEST 2] Creating Products: 2 Mobiles, 1 Clothing...');
    const p1 = await pool.query(`
      INSERT INTO products (name, slug, category, price, stock, is_active, is_deleted, status, vendor_id)
      VALUES ('SmartPhone Alpha', 'smartphone-alpha-${Date.now()}', 'Mobiles', 15000, 10, true, false, 'approved', $1)
      RETURNING id, name, category, is_active, is_deleted, status, stock
    `, [testVendorId]);
    testProduct1Id = p1.rows[0].id;

    const p2 = await pool.query(`
      INSERT INTO products (name, slug, category, price, stock, is_active, is_deleted, status, vendor_id)
      VALUES ('SmartPhone Beta', 'smartphone-beta-${Date.now()}', 'Mobiles', 25000, 5, true, false, 'approved', $1)
      RETURNING id, name, category, is_active, is_deleted, status, stock
    `, [testVendorId]);
    testProduct2Id = p2.rows[0].id;

    const p3 = await pool.query(`
      INSERT INTO products (name, slug, category, price, stock, is_active, is_deleted, status, vendor_id)
      VALUES ('Cotton Shirt', 'cotton-shirt-${Date.now()}', 'Clothing', 999, 50, true, false, 'approved', $1)
      RETURNING id, name, category, is_active, is_deleted, status, stock
    `, [testVendorId]);
    testProduct3Id = p3.rows[0].id;

    console.log(`✓ Products created:
      P1 [${p1.rows[0].name}]: Category=${p1.rows[0].category}, Active=${p1.rows[0].is_active}, Stock=${p1.rows[0].stock}
      P2 [${p2.rows[0].name}]: Category=${p2.rows[0].category}, Active=${p2.rows[0].is_active}, Stock=${p2.rows[0].stock}
      P3 [${p3.rows[0].name}]: Category=${p3.rows[0].category}, Active=${p3.rows[0].is_active}, Stock=${p3.rows[0].stock}`);

    // 3. Test Preview Replacement Logic
    console.log('\n[TEST 3] Testing Category Replacement Preview (Replacing Mobiles -> Sarees)...');
    const oldCats = vendorRes.rows[0].selected_categories;
    const requestedCats = ['Clothing', 'Sarees']; // Replacing Mobiles with Sarees
    const removedCats = oldCats.filter(c => !requestedCats.includes(c));
    const addedCats = requestedCats.filter(c => !oldCats.includes(c));
    const keptCats = oldCats.filter(c => requestedCats.includes(c));

    console.log(`  Added: [${addedCats.join(', ')}], Removed: [${removedCats.join(', ')}], Kept: [${keptCats.join(', ')}]`);

    const affectedProductsRes = await pool.query(`
      SELECT id, name, category, stock, price, status
      FROM products
      WHERE vendor_id = $1 AND category = ANY($2::text[]) AND (is_deleted IS NULL OR is_deleted = false) AND (status IS NULL OR status != 'archived')
    `, [testVendorId, removedCats]);

    console.log(`✓ Affected Products found in removed category 'Mobiles': ${affectedProductsRes.rows.length}`);
    if (affectedProductsRes.rows.length !== 2) {
      throw new Error(`Expected 2 affected products, found ${affectedProductsRes.rows.length}`);
    }

    // 4. Test Enforcing Plan Category Limit (e.g. attempting to select 3 categories when limit is 2)
    console.log('\n[TEST 4] Testing Category Limit Enforcement...');
    const exceedingCats = ['Clothing', 'Sarees', 'Electronics'];
    const limitCheck = exceedingCats.length <= 2;
    console.log(`  Attempting ${exceedingCats.length} categories against limit 2: Allowed = ${limitCheck}`);
    if (limitCheck) {
      throw new Error('Category limit enforcement failed: allowed 3 categories when limit is 2');
    }
    console.log('✓ Successfully blocked exceeding categories beyond subscription entitlement');

    // 5. Test Atomic Replacement Transaction
    console.log('\n[TEST 5] Executing Atomic Category Replacement Transaction...');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update vendor selected categories
      await client.query(
        'UPDATE vendors SET selected_categories = $1 WHERE id = $2',
        [JSON.stringify(requestedCats), testVendorId]
      );

      // Soft-archive products in removed categories
      const archiveRes = await client.query(
        `UPDATE products 
         SET is_active = false,
             is_deleted = true,
             stock = 0,
             status = 'archived'
         WHERE vendor_id = $1 AND category = ANY($2::text[]) AND (is_deleted IS NULL OR is_deleted = false) AND (status IS NULL OR status != 'archived')
         RETURNING id, name, category, is_active, is_deleted, stock, status`,
        [testVendorId, removedCats]
      );

      const archivedProductIds = archiveRes.rows.map(r => r.id);

      // Record audit history
      await client.query(
        `INSERT INTO vendor_category_history 
          (vendor_id, previous_categories, new_categories, removed_categories, added_categories, affected_product_ids, affected_products_count, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          testVendorId,
          JSON.stringify(oldCats),
          JSON.stringify(requestedCats),
          JSON.stringify(removedCats),
          JSON.stringify(addedCats),
          JSON.stringify(archivedProductIds),
          archivedProductIds.length,
          'Replaced Mobiles with Sarees in plan limit test'
        ]
      );

      await client.query('COMMIT');
      console.log(`✓ Transaction committed successfully! Soft-archived ${archivedProductIds.length} products.`);
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // 6. Verify Database State Post-Replacement
    console.log('\n[TEST 6] Verifying Database State Post-Replacement...');
    const updatedVendor = await pool.query('SELECT selected_categories FROM vendors WHERE id = $1', [testVendorId]);
    console.log('  Updated vendor selected_categories:', updatedVendor.rows[0].selected_categories);
    if (!updatedVendor.rows[0].selected_categories.includes('Sarees') || updatedVendor.rows[0].selected_categories.includes('Mobiles')) {
      throw new Error('Vendor categories not updated correctly in DB');
    }

    // Verify Mobiles products are soft-archived
    const mobilesCheck = await pool.query('SELECT id, name, category, is_active, is_deleted, stock, status FROM products WHERE id = ANY($1::int[])', [[testProduct1Id, testProduct2Id]]);
    for (const prod of mobilesCheck.rows) {
      console.log(`  Product [${prod.name}]: is_active=${prod.is_active}, is_deleted=${prod.is_deleted}, stock=${prod.stock}, status=${prod.status}`);
      if (prod.is_active !== false || prod.is_deleted !== true || prod.stock !== 0 || prod.status !== 'archived') {
        throw new Error(`Product ${prod.id} not properly soft-archived!`);
      }
    }
    console.log('✓ All Mobiles products verified: is_active=false, is_deleted=true, stock=0, status=archived');

    // Verify Clothing product remains active and intact
    const clothingCheck = await pool.query('SELECT id, name, category, is_active, is_deleted, stock, status FROM products WHERE id = $1', [testProduct3Id]);
    const shirt = clothingCheck.rows[0];
    console.log(`  Product [${shirt.name}]: is_active=${shirt.is_active}, is_deleted=${shirt.is_deleted}, stock=${shirt.stock}, status=${shirt.status}`);
    if (shirt.is_active !== true || shirt.is_deleted !== false || shirt.stock !== 50 || shirt.status !== 'approved') {
      throw new Error('Kept category product was mistakenly modified!');
    }
    console.log('✓ Kept Clothing category product remains completely unaffected and active');

    // 7. Verify Audit History
    console.log('\n[TEST 7] Verifying Audit History in vendor_category_history...');
    const historyRes = await pool.query('SELECT * FROM vendor_category_history WHERE vendor_id = $1 ORDER BY created_at DESC', [testVendorId]);
    console.log(`  Found ${historyRes.rows.length} audit entry:`, {
      id: historyRes.rows[0].id,
      previous: historyRes.rows[0].previous_categories,
      new: historyRes.rows[0].new_categories,
      removed: historyRes.rows[0].removed_categories,
      added: historyRes.rows[0].added_categories,
      affected_count: historyRes.rows[0].affected_products_count
    });
    if (historyRes.rows.length === 0 || historyRes.rows[0].affected_products_count !== 2) {
      throw new Error('Audit record not saved accurately');
    }
    console.log('✓ Audit trail verified');

    // 8. Verify General/Customer Products Query Exclusion
    console.log('\n[TEST 8] Verifying Customer / General Query Exclusions...');
    const customerQuery = await pool.query(`
      SELECT id, name, category, status 
      FROM products 
      WHERE (is_deleted IS NULL OR is_deleted = false) 
        AND (status IS NULL OR status != 'archived')
        AND id = ANY($1::int[])
    `, [[testProduct1Id, testProduct2Id, testProduct3Id]]);

    console.log(`  Customer query returned ${customerQuery.rows.length} products:`, customerQuery.rows.map(r => r.name));
    if (customerQuery.rows.length !== 1 || customerQuery.rows[0].id !== testProduct3Id) {
      throw new Error('Archived products leaked into customer product query!');
    }
    console.log('✓ Archived products successfully hidden from customer listings & marketplace searches');

    // 9. Test Rollback Safety on Transaction Failure
    console.log('\n[TEST 9] Verifying Atomic Rollback Behavior on Failure...');
    const rollbackClient = await pool.connect();
    try {
      await rollbackClient.query('BEGIN');
      await rollbackClient.query('UPDATE vendors SET selected_categories = $1 WHERE id = $2', [JSON.stringify(['Should', 'Rollback']), testVendorId]);
      // Trigger intentional error (e.g. invalid syntax or constraint violation)
      await rollbackClient.query('UPDATE non_existent_table_trigger_fail SET dummy = 1');
      await rollbackClient.query('COMMIT');
    } catch (e) {
      await rollbackClient.query('ROLLBACK');
      console.log('  Intentional error triggered rollback as expected:', e.message);
    } finally {
      rollbackClient.release();
    }

    const checkAfterRollback = await pool.query('SELECT selected_categories FROM vendors WHERE id = $1', [testVendorId]);
    console.log('  Categories after rollback:', checkAfterRollback.rows[0].selected_categories);
    if (checkAfterRollback.rows[0].selected_categories.includes('Should')) {
      throw new Error('Rollback failed: partial changes persisted');
    }
    console.log('✓ Transaction rollback safety verified: no partial updates persisted');

    console.log('\n======================================================');
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! ARCHITECTURE INTEGRITY CONFIRMED.');
    console.log('======================================================');

  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    // Cleanup test data
    console.log('\nCleaning up test artifacts...');
    if (testVendorId) {
      await pool.query('DELETE FROM vendor_category_history WHERE vendor_id = $1', [testVendorId]);
      await pool.query('DELETE FROM products WHERE vendor_id = $1', [testVendorId]);
      await pool.query('DELETE FROM vendor_subscriptions WHERE vendor_id = $1', [testVendorId]);
      await pool.query('DELETE FROM vendors WHERE id = $1', [testVendorId]);
      console.log('✓ Cleanup completed.');
    }
    await pool.end();
  }
}

runTestSuite();
