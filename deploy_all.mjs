import fs from 'fs';
import path from 'path';
import pg from 'pg';

const connectionString = "postgresql://postgres:Kaaerp%402026@db.euoaoyzpurbvcoxydunl.supabase.co:5432/postgres";

const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

const filesToRun = [
    // 1. Manually create companies table if missing
    {
        name: '00_init_companies (inline)',
        isInline: true,
        sql: `
        CREATE TABLE IF NOT EXISTS companies (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
            name TEXT NOT NULL,
            code TEXT,
            display_name TEXT,
            legal_name TEXT,
            email TEXT,
            phone TEXT,
            website TEXT,
            address_line_1 TEXT,
            address_line_2 TEXT,
            city TEXT,
            state TEXT,
            country TEXT,
            zip_code TEXT,
            tax_id TEXT,
            currency TEXT DEFAULT 'USD',
            timezone TEXT,
            logo_url TEXT,
            theme_color TEXT
        );
        ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Public Read Companies" ON companies;
        CREATE POLICY "Public Read Companies" ON companies FOR SELECT USING (true);
        `
    },
    // 2. Base Schemas
    { name: 'supabase_schema.sql', path: './supabase_schema.sql' },
    { name: 'fix_companies_schema.sql', path: './fix_companies_schema.sql' }
];

async function getMigrationFiles() {
    const migrationsDir = './supabase/migrations';
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    return files.map(f => ({ name: f, path: path.join(migrationsDir, f) }));
}

async function run() {
    try {
        const client = await pool.connect();
        
        let allFiles = [...filesToRun];
        
        // Append all migration files in order
        const migrations = await getMigrationFiles();
        allFiles.push(...migrations);
        
        // Append supplementary scripts AFTER migrations so tables exist
        allFiles.push({ name: 'supabase_logic.sql', path: './supabase_logic.sql' });
        allFiles.push({ name: 'phase9_provision_database.sql', path: './phase9_provision_database.sql' });
        allFiles.push({ name: 'install_inventory_module.sql', path: './install_inventory_module.sql' });
        allFiles.push({ name: 'configuration_schema.sql', path: './configuration_schema.sql' });
        allFiles.push({ name: 'seed_master_data.sql', path: './seed_master_data.sql' });
        
        console.log(`Starting execution of ${allFiles.length} files...`);

        for (const file of allFiles) {
            console.log(`\nExecuting: ${file.name}...`);
            try {
                let sql = file.isInline ? file.sql : fs.readFileSync(file.path, 'utf8');
                
                if (file.name === 'supabase_schema.sql') {
                    // Split the file into statements (roughly) to execute individually
                    // Or just use exact string replace for the PL/pgSQL function
                    sql = sql.replace(
                        `CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;`,
                        () => `CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT company_id FROM profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;`
                    );

                    // Rip out the DO block
                    const doStart = sql.indexOf('DO $$');
                    const doEnd = sql.indexOf('END $$;');
                    if (doStart !== -1 && doEnd !== -1) {
                        sql = sql.substring(0, doStart) + sql.substring(doEnd + 7);
                    }
                }

                if (file.name === 'supabase_schema.sql') {
                    fs.writeFileSync('debug_supabase_schema.sql', sql);
                }

                // If executing a huge file fails with syntax errors, it's better to log the first few chars
                try {
                    await client.query(sql);
                    console.log(`[SUCCESS] ${file.name}`);
                } catch (qErr) {
                    console.error(`[SQL ERROR in ${file.name}]: ${qErr.message}`);
                    throw qErr;
                }
            } catch (err) {
                console.error(`[FAILED] ${file.name}`);
                console.error(err.message);
                // We'll continue on error to ensure all tables get a chance to create, 
                // but some might fail if dependencies are missing.
                // NOTE: If a query error is re-thrown, it will be caught by the outer try-catch of the run() function.
            }
        }
        
        client.release();
        console.log("\nFinished database setup.");
    } catch(e) {
        console.error("Connection failed:", e.message);
    } finally {
        pool.end();
    }
}

run();
