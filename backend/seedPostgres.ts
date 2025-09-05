/**
 * backend/seedPostgres.ts
 *
 * This is a one-time script you can run from your local machine to populate your
 * Cloud SQL (PostgreSQL) database with data from BigQuery.
 *
 * PRE-REQUISITES:
 * 1. You have created a Cloud SQL for PostgreSQL instance and a database.
 * 2. You have configured the instance to allow connections from your public IP address.
 * 3. You have installed the necessary packages: `npm install`
 * 4. You have authenticated your local machine with GCP: `gcloud auth application-default login`
 *
 * HOW TO RUN:
 * 1. Fill in your database connection details in the CONFIGURATION section below.
 * 2. From the root directory of your project, run:
 *    `npx ts-node backend/seedPostgres.ts`
 */

import { BigQuery } from '@google-cloud/bigquery';
import { Client } from 'pg';

// --- CONFIGURATION ---
// IMPORTANT: Replace with your actual GCP Project ID and Postgres connection details.
const GCLOUD_PROJECT_ID = 'digital-arbor-400';

const POSTGRES_CONFIG = {
  user: 'postgres', // Or your specific user
  host: 'YOUR_INSTANCE_PUBLIC_IP', // The public IP address of your Cloud SQL instance
  database: 'opportunity_tracker', // The database name you created
  password: 'YOUR_POSTGRES_PASSWORD', // The password for your user
  port: 5432,
  ssl: {
    rejectUnauthorized: false, // Required for simple SSL connection to Cloud SQL
  },
};

// --- INITIALIZE CLIENTS ---
const bigquery = new BigQuery({ projectId: GCLOUD_PROJECT_ID });

// The exact SQL for the full opportunities list.
const OPPORTUNITIES_QUERY = `
    SELECT
        opportunities.id  AS opportunities_id,
        opportunities.name  AS opportunities_name,
        CAST(opportunities.subscription_start_date AS STRING) AS opportunities_subscription_start_date,
        opportunities.stage_name  AS opportunities_stage_name,
        opportunities.owner_name  AS opportunities_owner_name,
        CAST(DATE(opportunities.renewal_date_on_creation , 'America/Los_Angeles') AS STRING) AS opportunities_renewal_date_on_creation_date,
        opportunities.automated_renewal_status  AS opportunities_automated_renewal_status,
        safe_divide((accounts.dollars_balance - coalesce(accounts.dollars_used, 0)), accounts.average_monthly_dollars_used_4_mos)  AS accounts_dollars_months_left,
        (CASE WHEN opportunities.has_services_flag  THEN 'Yes' ELSE 'No' END) AS opportunities_has_services_flag,
        opportunities.amount_services  AS opportunities_amount_services,
        accounts.outreach_account_link  AS accounts_outreach_account_link,
        accounts.salesforce_account_name  AS accounts_salesforce_account_name,
        accounts.primary_fivetran_account_status  AS accounts_primary_fivetran_account_status,
        opportunities.quoted_products  AS opportunities_quoted_products,
        opportunities.product_being_pitched  AS opportunities_product_being_pitched,
        accounts.se_territory_owner_email  AS accounts_se_territory_owner_email,
        opportunities.connector_type_list  AS opportunities_connectors,
        opportunities.connector_tshirt_size_list  AS opportunities_connector_tshirt_size_list,
        opportunities.destinations  AS opportunities_destinations,
        opportunities.type  AS opportunities_type,
        accounts.region_name  AS accounts_region_name,
        accounts.salesforce_account_id  AS accounts_salesforce_account_id,
        opportunities.manager_of_opp_email  AS opportunities_manager_of_opp_email,
        CAST(DATE(accounts.subscription_end_date ) AS STRING) AS accounts_subscription_end_date,
        COALESCE(SUM(opportunities.incremental_bookings_forecast_c ), 0) AS opportunities_incremental_bookings,
        COALESCE(SUM(opportunities.amount ), 0) AS opportunities_amount
    FROM \`digital-arbor-400\`.transforms_bi.opportunities  AS opportunities
    INNER JOIN \`digital-arbor-400\`.transforms_bi.accounts  AS accounts ON opportunities.salesforce_account_id = accounts.salesforce_account_id
    WHERE ((UPPER(( accounts.region_name  )) = UPPER('NA - Enterprise') OR UPPER(( accounts.region_name  )) = UPPER('NA - Commercial'))) 
    GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24
    ORDER BY 26 DESC, 25 DESC
`;

// This SQL creates a table with a schema that perfectly matches the BigQuery output.
const CREATE_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS opportunities (
        opportunities_id VARCHAR(255) PRIMARY KEY,
        opportunities_name TEXT,
        opportunities_subscription_start_date DATE,
        opportunities_stage_name VARCHAR(255),
        opportunities_owner_name VARCHAR(255),
        opportunities_renewal_date_on_creation_date DATE,
        opportunities_automated_renewal_status VARCHAR(255),
        accounts_dollars_months_left NUMERIC,
        opportunities_has_services_flag VARCHAR(3),
        opportunities_amount_services NUMERIC,
        accounts_outreach_account_link TEXT,
        accounts_salesforce_account_name TEXT,
        accounts_primary_fivetran_account_status VARCHAR(255),
        opportunities_quoted_products TEXT,
        opportunities_product_being_pitched TEXT,
        accounts_se_territory_owner_email VARCHAR(255),
        opportunities_connectors TEXT,
        opportunities_connector_tshirt_size_list TEXT,
        opportunities_destinations TEXT,
        opportunities_type VARCHAR(255),
        accounts_region_name VARCHAR(255),
        accounts_salesforce_account_id VARCHAR(255),
        opportunities_manager_of_opp_email VARCHAR(255),
        accounts_subscription_end_date DATE,
        opportunities_incremental_bookings NUMERIC,
        opportunities_amount NUMERIC
    );
`;

async function seedDatabase() {
  if (POSTGRES_CONFIG.host === 'YOUR_INSTANCE_PUBLIC_IP' || POSTGRES_CONFIG.password === 'YOUR_POSTGRES_PASSWORD') {
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error('!!! PLEASE UPDATE POSTGRES_CONFIG in backend/seedPostgres.ts !!!');
    console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    return;
  }

  const pgClient = new Client(POSTGRES_CONFIG);
  console.log('--- Starting PostgreSQL Database Seeding Process ---');

  try {
    // 1. Connect to PostgreSQL
    await pgClient.connect();
    console.log('Step 1: Successfully connected to PostgreSQL.');

    // 2. Create the table if it doesn't exist
    console.log('Step 2: Ensuring "opportunities" table exists...');
    await pgClient.query(CREATE_TABLE_SQL);
    console.log('\t> Table "opportunities" is ready.');

    // 3. Fetch data from BigQuery
    console.log('Step 3: Fetching opportunities from BigQuery...');
    const [rows] = await bigquery.query({ query: OPPORTUNITIES_QUERY });
    console.log(`\t> Found ${rows.length} opportunities to sync.`);

    if (rows.length === 0) {
      console.log('No rows returned from BigQuery. Exiting.');
      return;
    }

    // 4. Insert data into PostgreSQL
    // We'll clear the table first to ensure a fresh sync.
    console.log('Step 4: Inserting data into PostgreSQL...');
    await pgClient.query('TRUNCATE TABLE opportunities;');
    console.log('\t> Cleared existing data from table.');

    // Loop through rows and insert them. For larger datasets, a more efficient
    // batch insert or COPY command would be used, but this is clear and effective for <5000 rows.
    for (const row of rows) {
        const columns = Object.keys(row);
        const values = Object.values(row);
        const valuePlaceholders = columns.map((_, i) => `$${i + 1}`).join(', ');

        const insertQuery = `INSERT INTO opportunities (${columns.join(', ')}) VALUES (${valuePlaceholders}) ON CONFLICT (opportunities_id) DO UPDATE SET ${columns.map(col => `${col} = EXCLUDED.${col}`).join(', ')}`;
        
        await pgClient.query(insertQuery, values);
    }
    
    console.log(`\t> Successfully inserted ${rows.length} records.`);
    console.log('--- Database Seeding Process Complete ---');

  } catch (error) {
    console.error('An error occurred during the seeding process:', error);
  } finally {
    // 5. Close the connection
    await pgClient.end();
    console.log('PostgreSQL connection closed.');
  }
}

// Run the script
seedDatabase();
