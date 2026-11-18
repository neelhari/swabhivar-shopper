const pool = require('./db');

async function migrateReferralRewards() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Creating referral_rewards table if not exists...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS referral_rewards (
        id SERIAL PRIMARY KEY,
        referrer_type VARCHAR(20) NOT NULL,
        referrer_id INTEGER NOT NULL,
        referral_code VARCHAR(50) NOT NULL,
        referred_type VARCHAR(20) NOT NULL,
        referred_id INTEGER NOT NULL,
        event_type VARCHAR(30) NOT NULL,
        event_reference VARCHAR(100) NOT NULL,
        eligible_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        reward_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
        reward_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'approved',
        payout_id INTEGER,
        payout_reference VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_referral_reward_event UNIQUE (referrer_type, referrer_id, event_type, event_reference)
      );

      CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards(referrer_type, referrer_id);
      CREATE INDEX IF NOT EXISTS idx_referral_rewards_code ON referral_rewards(referral_code);
      CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON referral_rewards(status);
    `);

    // Backfill historical referral credit for Vendor 1 (Tx #1: ₹10)
    const existingLegacy = await client.query(
      "SELECT id FROM referral_rewards WHERE referrer_type='vendor' AND referrer_id=1 AND event_type='customer_order' AND event_reference='LEGACY_SIGNUP_BONUS_TX1'"
    );

    if (existingLegacy.rows.length === 0) {
      console.log('Backfilling historical Vendor 1 referral credit (Tx #1)...');
      await client.query(`
        INSERT INTO referral_rewards (
          referrer_type, referrer_id, referral_code,
          referred_type, referred_id, event_type, event_reference,
          eligible_amount, reward_percent, reward_amount, status, payout_reference, notes, created_at
        ) VALUES (
          'vendor', 1, '8w4q98',
          'customer', 6, 'customer_order', 'LEGACY_SIGNUP_BONUS_TX1',
          10.00, 100.00, 10.00, 'paid', 'BULK_PAYOUT_TX5', 'Historical referral signup bonus from 2026-09-06 (settled in Bulk Payout Tx #5)', '2026-09-06 15:25:59.812'
        )
      `);
    }

    await client.query('COMMIT');
    console.log('✅ referral_rewards migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration error:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrateReferralRewards();

