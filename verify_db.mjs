import pg from 'pg';

const connectionString = "postgresql://postgres:Kaaerp%402026@db.euoaoyzpurbvcoxydunl.supabase.co:5432/postgres";

const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        const client = await pool.connect();
        
        // Query to check some essential tables
        const res = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('companies', 'profiles', 'employees', 'leaves', 'payroll', 'crm_deals', 'workflows')
            ORDER BY table_name;
        `);
        
        console.log("Found essential tables:");
        for(let row of res.rows) {
            console.log(" - " + row.table_name);
        }

        const missing = ['companies', 'profiles', 'employees', 'leaves', 'payroll', 'crm_deals', 'workflows']
            .filter(t => !res.rows.find(r => r.table_name === t));
        
        if (missing.length > 0) {
            console.log("\nMissing tables:", missing.join(', '));
        } else {
            console.log("\nAll essential tables are present!");
        }

        
        const countRes = await client.query(`
            SELECT count(*) as count
            FROM information_schema.tables 
            WHERE table_schema = 'public';
        `);
        console.log(`\nTotal tables in public schema: ${countRes.rows[0].count}`);

        client.release();
    } catch(e) {
        console.error("Connection failed:", e.message);
    } finally {
        pool.end();
    }
}

run();
