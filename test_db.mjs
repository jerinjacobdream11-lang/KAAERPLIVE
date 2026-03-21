import pg from 'pg';

const connectionString = "postgresql://postgres:Kaaerp%402026@db.euoaoyzpurbvcoxydunl.supabase.co:5432/postgres";

const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        const client = await pool.connect();
        const res = await client.query('SELECT version();');
        console.log("Connected successfully:", res.rows[0]);
        client.release();
    } catch(e) {
        console.error("Connection failed:", e.message);
    } finally {
        pool.end();
    }
}
run();
