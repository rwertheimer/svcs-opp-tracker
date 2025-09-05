
/**
 * backend/syncOpportunities.ts
 * 
 * This file is a BLUEPRINT for your scheduled data synchronization function.
 * It would be deployed as a serverless function (e.g., Google Cloud Function) and
 * triggered on a schedule (e.g., hourly by Google Cloud Scheduler).
 * 
 * Its one job: run the big query against BigQuery and save the results to your fast
 * app database (like Firestore), where the API server can read it quickly.
 */

/*
// --- Example using Google Cloud Functions ---
import { BigQuery } from '@google-cloud/bigquery';
import { Firestore } from '@google-cloud/firestore';

const bigquery = new BigQuery();
const firestore = new Firestore();

// This function would be triggered by Cloud Scheduler
export const syncOpportunities = async (req, res) => {
    console.log('Starting scheduled opportunity sync...');

    try {
        // Step 1: Define the BigQuery SQL query to fetch all relevant opportunities.
        // This is the exact SQL you provided.
        const query = `
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
            GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24
            ORDER BY 26 DESC, 25 DESC
        `;

        // Step 2: Execute the query
        const [rows] = await bigquery.query({ query });
        console.log(`Fetched ${rows.length} opportunities from BigQuery.`);

        // Step 3: Write the results to Firestore.
        // We use a "batch" write for efficiency, which can handle up to 500 operations at once.
        const batch = firestore.batch();
        const collectionRef = firestore.collection('opportunities');

        rows.forEach(row => {
            // We use the unique opportunity ID from BigQuery as the document ID in Firestore.
            const docRef = collectionRef.doc(row.opportunities_id);
            // We use `set` with `merge: true` to upsert the data. This will update existing
            // records and create new ones. It intelligently preserves app-specific data
            // like the 'disposition' field if it already exists on the document.
            batch.set(docRef, row, { merge: true });
        });

        // Step 4: Commit the batch write.
        await batch.commit();
        console.log('Successfully synced opportunities to Firestore.');

        res.status(200).send('Sync completed successfully.');

    } catch (error) {
        console.error('Error during scheduled opportunity sync:', error);
        res.status(500).send('Sync failed.');
    }
};

*/
