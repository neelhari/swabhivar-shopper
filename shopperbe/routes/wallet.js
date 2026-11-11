const router = require('express').Router();
const pool = require('../db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

router.get('/banks', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, account_name, account_number, ifsc_code, bank_name, created_at FROM user_saved_banks WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch saved banks' });
  }
});

router.post('/banks', authMiddleware, async (req, res) => {
  const { account_name, account_number, ifsc_code, bank_name } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO user_saved_banks (user_id, account_name, account_number, ifsc_code, bank_name) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [req.user.id, account_name, account_number, ifsc_code, bank_name]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save bank details' });
  }
});

router.post('/payout', authMiddleware, async (req, res) => {
  const { amount, bank_details } = req.body;
  if (!amount || amount <= 0 || !bank_details) return res.status(400).json({ error: 'Invalid amount or bank details' });

  try {
    await pool.query('BEGIN');
    const userRes = await pool.query('SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
    const balance = parseFloat(userRes.rows[0]?.wallet_balance || 0);
    
    if (balance < amount) {
      await pool.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }
    
    await pool.query('UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2', [amount, req.user.id]);
    const payoutId = 'PAY-' + Math.floor(100000 + Math.random() * 900000);
    const result = await pool.query(
      "INSERT INTO payout_requests (payout_id, user_id, amount, status, bank_details) VALUES ($1, $2, $3, 'pending', $4) RETURNING *",
      [payoutId, req.user.id, amount, JSON.stringify(bank_details)]
    );
    
    await pool.query('COMMIT');
    res.json({ success: true, request: result.rows[0] });
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to submit payout request' });
  }
});

router.get('/payouts', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, payout_id, amount, status, bank_details, created_at FROM payout_requests WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payout requests' });
  }
});

module.exports = router;
