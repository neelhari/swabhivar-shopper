const pool = require('./db');

async function reconcileVendorWallet() {
  console.log('=====================================================');
  console.log('  SHOPPER - VENDOR #1 WALLET ACCOUNTING CLEANUP      ');
  console.log('=====================================================\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Inspect current state of Vendor #1
    const vBefore = await client.query('SELECT id, name, store_name, wallet_balance, outstanding_debt FROM vendors WHERE id = 1 FOR UPDATE');
    console.log('Current Vendor #1 record before cleanup:', vBefore.rows[0]);

    if (parseFloat(vBefore.rows[0].wallet_balance) !== -3000.00) {
      throw new Error(`Unexpected wallet balance: ${vBefore.rows[0].wallet_balance}. Expected -3000.00.`);
    }

    // 2. Inspect the 3 duplicate debit transactions: IDs 6, 7, 8
    const dupCheck = await client.query(`
      SELECT id, vendor_id, type, amount, order_number, description 
      FROM vendor_transactions 
      WHERE id IN (6, 7, 8) AND vendor_id = 1
      ORDER BY id ASC
    `);

    console.log('\nFound duplicate transactions to void:');
    dupCheck.rows.forEach(r => console.log(`  Tx #${r.id}: ${r.type} ₹${r.amount} - ${r.order_number} (${r.description})`));

    if (dupCheck.rows.length !== 3) {
      throw new Error(`Expected 3 duplicate transactions (IDs 6, 7, 8), found ${dupCheck.rows.length}`);
    }

    // 3. Mark the 3 duplicate debit transactions as 'voided' with clear audit description
    for (const tx of dupCheck.rows) {
      const newDesc = `[VOIDED DUPLICATE] ${tx.description} (Voided on 2026-11-13: already settled in bulk payout Tx #5)`;
      await client.query(`
        UPDATE vendor_transactions 
        SET type = 'voided',
            description = $1
        WHERE id = $2 AND vendor_id = 1
      `, [newDesc, tx.id]);
      console.log(`  ✓ Voided Tx #${tx.id}: updated type to 'voided'`);
    }

    // 4. Restore Vendor #1's wallet balance from -3000.00 to 0.00
    const vUpdate = await client.query(`
      UPDATE vendors 
      SET wallet_balance = 0.00 
      WHERE id = 1 AND wallet_balance = -3000.00
      RETURNING id, name, store_name, wallet_balance, outstanding_debt
    `);

    console.log('\nRestored Vendor #1 wallet:', vUpdate.rows[0]);

    // 5. Verify the full ledger for Vendor #1
    const ledger = await client.query(`
      SELECT id, type, amount, order_number, description, created_at 
      FROM vendor_transactions 
      WHERE vendor_id = 1 
      ORDER BY id ASC
    `);

    console.log('\nUpdated Ledger for Vendor #1:');
    let runningBalance = 0;
    ledger.rows.forEach(r => {
      const amt = parseFloat(r.amount);
      if (r.type === 'credit') runningBalance += amt;
      else if (r.type === 'debit') runningBalance -= amt;
      // voided transactions do not affect running balance
      console.log(`  ID #${r.id} | ${r.type.toUpperCase().padEnd(7)} | ₹${amt.toFixed(2).padStart(8)} | ${r.order_number || 'BULK/N/A'} | Running: ₹${runningBalance.toFixed(2)} | ${r.description.substring(0, 70)}...`);
    });

    console.log(`\nFinal Calculated Running Balance: ₹${runningBalance.toFixed(2)}`);
    console.log(`Final Database Wallet Balance:    ₹${parseFloat(vUpdate.rows[0].wallet_balance).toFixed(2)}`);

    if (runningBalance !== 0 || parseFloat(vUpdate.rows[0].wallet_balance) !== 0) {
      throw new Error('Balance mismatch! Rolling back.');
    }

    // Commit changes
    await client.query('COMMIT');
    console.log('\n✓ CLEANUP COMMITTED SUCCESSFULLY TO PRODUCTION DATABASE.');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reconciliation failed. Rolled back:', err);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
}

reconcileVendorWallet().catch(console.error);

