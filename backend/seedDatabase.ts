/**
 * backend/seedDatabase.ts
 *
 * This is a one-time script you can run from your local machine to populate your
 * Firestore database with data from BigQuery.
 *
 * PRE-REQUISITES:
 * 1. You have a GCP project with Firestore and BigQuery APIs enabled.
 * 2. You have created a Firestore database in your project.
 * 3. You have installed the necessary packages: `npm install`
 * 4. You have authenticated your local machine with GCP: `gcloud auth application-default login`
 *
 * HOW TO RUN:
 * From the root directory of your project, run:
 * `npx ts-node backend/seedDatabase.ts`
 */

import { BigQuery } from '@google-cloud/bigquery';
import { Firestore } from '@google-cloud/firestore';
import logger from './logger';

// --- CONFIGURATION ---
// IMPORTANT: Replace with your actual GCP Project ID
const GCLOUD_PROJECT_ID = 'digital-arbor-400';
const FIRESTORE_COLLECTION = 'opportunities';

// --- INITIALIZE CLIENTS ---
const bigquery = new BigQuery({ projectId: GCLOUD_PROJECT_ID });
const firestore = new Firestore({ projectId: GCLOUD_PROJECT_ID });


// The exact SQL for the full opportunities list.
const OPPORTUNITIES_QUERY = `
    SELECT
        opportunities.id  AS opportunities_id,
        opportunities.name  AS opportunities_name,
            (opportunities.subscription_start_date ) AS opportunities_subscription_start_date,
        opportunities.stage_name  AS opportunities_stage_name,
        opportunities.owner_name  AS opportunities_owner_name,
            (DATE(opportunities.renewal_date_on_creation , 'America/Los_Angeles')) AS opportunities_renewal_date_on_creation_date,
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
            (DATE(accounts.subscription_end_date )) AS accounts_subscription_end_date,
        COALESCE(SUM(opportunities.incremental_bookings_forecast_c ), 0) AS opportunities_incremental_bookings,
        COALESCE(SUM(opportunities.amount ), 0) AS opportunities_amount
    FROM \`digital-arbor-400\`.transforms_bi.opportunities  AS opportunities
    INNER JOIN \`digital-arbor-400\`.transforms_bi.accounts  AS accounts ON opportunities.salesforce_account_id = accounts.salesforce_account_id
    WHERE ((UPPER(( accounts.region_name  )) = UPPER('NA - Enterprise') OR UPPER(( accounts.region_name  )) = UPPER('NA - Commercial'))) 
    GROUP BY
        1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24
    ORDER BY
        26 DESC,
        25 DESC
`;

async function seedDatabase() {
  logger.info('Starting database seeding process');

  try {
    // 1. Fetch data from BigQuery
    logger.info('Fetching opportunities from BigQuery');
    const [rows] = await bigquery.query({ query: OPPORTUNITIES_QUERY });
    logger.info({ count: rows.length }, 'Found opportunities to sync');

    if (rows.length === 0) {
      logger.info('No rows returned from BigQuery; exiting');
      return;
    }

    // 2. Write data to Firestore in batches
    logger.info({ collection: FIRESTORE_COLLECTION }, 'Writing data to Firestore');
    
    // Firestore batches have a limit of 500 operations.
    const BATCH_SIZE = 499;
    let batch = firestore.batch();
    let operationCount = 0;
    let totalDocsWritten = 0;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row.opportunities_id) {
            logger.warn({ rowNumber: i + 1 }, "Skipping row missing 'opportunities_id'");
            continue;
        }

        // Use the opportunity ID as the unique document ID in Firestore.
        const docRef = firestore.collection(FIRESTORE_COLLECTION).doc(row.opportunities_id);
        
        // Use 'set' with 'merge: true' to perform an "upsert". This will
        // update existing documents or create new ones. It also preserves
        // any app-specific fields (like 'disposition') that might already exist.
        batch.set(docRef, row, { merge: true });
        operationCount++;

        // When the batch is full, commit it and start a new one.
        if (operationCount === BATCH_SIZE || i === rows.length - 1) {
            logger.info({ batchSize: operationCount }, 'Committing Firestore batch');
            await batch.commit();
            totalDocsWritten += operationCount;
            
            // Start a new batch
            batch = firestore.batch();
            operationCount = 0;
        }
    }

    logger.info({ documentsWritten: totalDocsWritten }, 'Finished writing documents to Firestore');
    logger.info('Database seeding process complete');

  } catch (error) {
    logger.error({ err: error }, 'Seeding process failed');
    // Fix: Suppress TypeScript error for process.exit, which is valid in Node.js.
    // @ts-ignore
    process.exit(1);
  }
}

// Run the script
seedDatabase();
