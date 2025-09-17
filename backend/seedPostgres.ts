/**
 * backend/seedPostgres.ts
 *
 * This script seeds the PostgreSQL database with a multi-user-ready schema and mock data.
 */

import { BigQuery } from '@google-cloud/bigquery';
import { Pool, PoolClient } from 'pg'; // Import PoolClient for typing
import * as dotenv from 'dotenv';

dotenv.config();

const GCLOUD_PROJECT_ID = 'digital-arbor-400';
const POSTGRES_CONFIG = {
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: parseInt(process.env.PG_PORT || '5432', 10),
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000,
};

const bigquery = new BigQuery({ projectId: GCLOUD_PROJECT_ID });

const OPPORTUNITIES_QUERY = `
    SELECT
        opportunities.id  AS opportunities_id,
        opportunities.name  AS opportunities_name,
        CAST(opportunities.subscription_start_date AS STRING) AS opportunities_subscription_start_date,
        opportunities.stage_name  AS opportunities_stage_name,
        opportunities.owner_name  AS opportunities_owner_name,
        CAST(DATE(opportunities.renewal_date_on_creation , 'America/Los_Angeles') AS STRING) AS opportunities_renewal_date_on_creation_date,
        opportunities.automated_renewal_status,
        CAST(safe_divide((accounts.dollars_balance - coalesce(accounts.dollars_used, 0)), accounts.average_monthly_dollars_used_4_mos) AS FLOAT64) AS accounts_dollars_months_left,
        (CASE WHEN opportunities.has_services_flag  THEN 'Yes' ELSE 'No' END) AS opportunities_has_services_flag,
        CAST(opportunities.amount_services AS FLOAT64) AS opportunities_amount_services,
        accounts.outreach_account_link,
        accounts.salesforce_account_name,
        accounts.primary_fivetran_account_status,
        opportunities.quoted_products,
        opportunities.product_being_pitched,
        accounts.se_territory_owner_email,
        opportunities.connector_type_list  AS opportunities_connectors,
        opportunities.connector_tshirt_size_list,
        destinations,
        opportunities.type  AS opportunities_type,
        accounts.region_name,
        accounts.salesforce_account_id,
        opportunities.manager_of_opp_email,
        CAST(DATE(accounts.subscription_end_date ) AS STRING) AS accounts_subscription_end_date,
        CAST(DATE(opportunities.close_date) AS STRING) AS opportunities_close_date,
        opportunities.primary_forecast_category_c AS opportunities_forecast_category,
        SAFE_CAST(opportunities.services_forecast_c AS FLOAT64) AS opportunities_services_forecast_sfdc,
        CAST(COALESCE(SUM(opportunities.incremental_bookings_forecast_c ), 0) AS FLOAT64) AS opportunities_incremental_bookings,
        CAST(COALESCE(SUM(opportunities.amount ), 0) AS FLOAT64) AS opportunities_amount
    FROM \`digital-arbor-400\`.transforms_bi.opportunities
    INNER JOIN \`digital-arbor-400\`.transforms_bi.accounts ON opportunities.salesforce_account_id = accounts.salesforce_account_id
    WHERE ((UPPER(accounts.region_name) = UPPER('NA - Enterprise') OR UPPER(accounts.region_name) = UPPER('NA - Commercial'))) 
    GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27
    ORDER BY 29 DESC, 28 DESC
`;

const CREATE_SCHEMA_SQL = `
    DROP TABLE IF EXISTS disposition_history, action_items, users, opportunities CASCADE;

    CREATE TABLE users (
        user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL
    );

    CREATE TABLE opportunities (
        opportunities_id VARCHAR(255) PRIMARY KEY,
        opportunities_name TEXT,
        opportunities_subscription_start_date DATE,
        opportunities_stage_name VARCHAR(255),
        opportunities_owner_name VARCHAR(255),
        opportunities_renewal_date_on_creation_date DATE,
        automated_renewal_status VARCHAR(255),
        accounts_dollars_months_left NUMERIC,
        opportunities_has_services_flag VARCHAR(3),
        opportunities_amount_services NUMERIC,
        outreach_account_link TEXT,
        salesforce_account_name TEXT,
        primary_fivetran_account_status VARCHAR(255),
        quoted_products TEXT,
        product_being_pitched TEXT,
        se_territory_owner_email VARCHAR(255),
        opportunities_connectors TEXT,
        connector_tshirt_size_list TEXT,
        destinations TEXT,
        opportunities_type VARCHAR(255),
        region_name VARCHAR(255),
        salesforce_account_id VARCHAR(255),
        manager_of_opp_email VARCHAR(255),
        accounts_subscription_end_date DATE,
        opportunities_close_date DATE,
        opportunities_forecast_category VARCHAR(255),
        opportunities_services_forecast_sfdc NUMERIC,
        opportunities_incremental_bookings NUMERIC,
        opportunities_amount NUMERIC,
        disposition JSONB
    );

    CREATE TABLE action_items (
        action_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        opportunity_id VARCHAR(255) REFERENCES opportunities(opportunities_id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        status VARCHAR(50) NOT NULL,
        due_date DATE,
        notes TEXT,
        documents JSONB,
        created_by_user_id UUID REFERENCES users(user_id),
        assigned_to_user_id UUID REFERENCES users(user_id)
    );

    CREATE TABLE disposition_history (
        history_id SERIAL PRIMARY KEY,
        opportunity_id VARCHAR(255) REFERENCES opportunities(opportunities_id) ON DELETE CASCADE,
        updated_by_user_id UUID REFERENCES users(user_id),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        change_details JSONB
    );
`;

const MOCK_USERS = [
    { name: 'Alice Johnson', email: 'alice.johnson@fivetran.com' },
    { name: 'Bob Williams', email: 'bob.williams@fivetran.com' },
    { name: 'Charlie Brown', email: 'charlie.brown@fivetran.com' },
    { name: 'Diana Miller', email: 'diana.miller@fivetran.com' }
];

async function seedDatabase() {
  console.log('--- Starting PostgreSQL Database Seeding ---');
  const pool = new Pool(POSTGRES_CONFIG);
  let client: PoolClient | null = null;
  
  try {
    console.log('[DEBUG] Step 1: Attempting to get client from pool...');
    client = await pool.connect();
    console.log('[DEBUG] Step 1: Client connected successfully.');

    console.log('[DEBUG] Step 2: Attempting to create schema...');
    await client.query(CREATE_SCHEMA_SQL);
    console.log('[DEBUG] Step 2: Schema created successfully.');
    
    console.log('[DEBUG] Step 3: Attempting to start transaction...');
    await client.query('BEGIN');
    console.log('[DEBUG] Step 3: Database transaction started.');

    console.log('[DEBUG] Step 4: Attempting to insert mock users...');
    const userInsertPromises = MOCK_USERS.map(user => 
        client!.query('INSERT INTO users (name, email) VALUES ($1, $2)', [user.name, user.email])
    );
    await Promise.all(userInsertPromises);
    const { rows: insertedUsers } = await client.query('SELECT * FROM users');
    console.log(`[DEBUG] Step 4: Inserted ${insertedUsers.length} users successfully.`);

    console.log('[DEBUG] Step 5: Attempting to fetch from BigQuery...');
    const [rows] = await bigquery.query({ query: OPPORTUNITIES_QUERY });
    console.log(`[DEBUG] Step 5: Fetched ${rows.length} opportunities from BigQuery.`);

    if (rows.length === 0) {
      console.log('No opportunities found, committing transaction.');
      await client.query('COMMIT');
      return;
    }

    console.log('[DEBUG] Step 6: Looping through opportunities to insert...');
    for (const [index, row] of rows.entries()) {
        const defaultDisposition = {
            status: 'Not Reviewed',
            notes: '',
            reason: '',
            version: 1,
            last_updated_by_user_id: insertedUsers[0].user_id,
        };
        
        const columns = Object.keys(row);
        const values = columns.map(col => row[col] === undefined ? null : row[col]);
        
        await client.query(
            `INSERT INTO opportunities (${columns.join(', ')}, disposition) VALUES (${columns.map((_, i) => `$${i+1}`).join(', ')}, $${columns.length + 1})`,
            [...values, defaultDisposition]
        );

        if (index === 0) {
            console.log(`\t> Inserting sample action items for opp: ${row.opportunities_name}`);
            const actionItems = [
                { name: 'Initial Scoping Call', status: 'Completed', created_by: insertedUsers[0].user_id, assigned_to: insertedUsers[0].user_id },
                { name: 'Develop Initial Proposal', status: 'In Progress', created_by: insertedUsers[0].user_id, assigned_to: insertedUsers[1].user_id },
                { name: 'Share Initial Proposal', status: 'Not Started', created_by: insertedUsers[1].user_id, assigned_to: insertedUsers[1].user_id },
            ];
            for (const item of actionItems) {
                console.log(`\t\t> Inserting action item: "${item.name}"`);
                await client.query(
                    'INSERT INTO action_items (opportunity_id, name, status, created_by_user_id, assigned_to_user_id) VALUES ($1, $2, $3, $4, $5)',
                    [row.opportunities_id, item.name, item.status, item.created_by, item.assigned_to]
                );
            }
        }
    }
    console.log(`[DEBUG] Step 6: Finished looping through opportunities.`);
    
    console.log('[DEBUG] Step 7: Attempting to commit transaction...');
    await client.query('COMMIT');
    console.log('[DEBUG] Step 7: Database transaction committed successfully.');
    console.log('--- Database Seeding Complete ---');

  } catch (error) {
    if (client) {
        console.error('--- An error occurred, attempting to roll back transaction... ---');
        await client.query('ROLLBACK');
        console.error('[DEBUG] Transaction rolled back.');
    }
    throw error;
  } finally {
    if (client) {
        console.log('[DEBUG] Step 8: Attempting to release client...');
        client.release();
        console.log('[DEBUG] Step 8: PostgreSQL client has been released.');
    }
    console.log('[DEBUG] Step 9: Attempting to end pool...');
    await pool.end();
    console.log('[DEBUG] Step 9: PostgreSQL pool has been closed.');
  }
}

seedDatabase()
  .then(() => {
    console.log('Script finished successfully in .then() block.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n--- A FATAL ERROR OCCURRED in .catch() block ---');
    console.error(error);
    process.exit(1);
  });
