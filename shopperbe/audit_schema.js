const pool = require('./db');

async function audit() {
  try {
    const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;");
    console.log("TABLES:", tables.rows.map(t => t.table_name));

    const userCols = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position;");
    console.log("\nUSERS COLUMNS:", userCols.rows);

    const vendorCols = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='vendors' ORDER BY ordinal_position;");
    console.log("\nVENDORS COLUMNS:", vendorCols.rows);

    const orderCols = await pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='orders' ORDER BY ordinal_position;");
    console.log("\nORDERS COLUMNS:", orderCols.rows);

    const fks = await pool.query(`
      SELECT
        tc.table_name, kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule
      FROM
        information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.referential_constraints AS rc
          ON tc.constraint_name = rc.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      ORDER BY tc.table_name;
    `);
    console.log("\nFOREIGN KEYS & DELETE RULES:", fks.rows);

  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

audit();

