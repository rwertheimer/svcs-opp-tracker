/**
 * backend/server.ts
 * 
 * This file is a BLUEPRINT for your backend API server.
 * It would be deployed as a service, for example, on Google Cloud Run.
 * It shows how you would structure an Express.js server to handle requests from your frontend.
 */

/*
// --- Example using Express.js ---
import express from 'express';
// You would use a library to connect to your fast app database, like Firestore
import { Firestore } from '@google-cloud/firestore';
// You would also need the BigQuery client for on-demand queries
import { BigQuery } from '@google-cloud/bigquery';

const app = express();
const firestore = new Firestore();
const bigquery = new BigQuery();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// --- API ROUTES ---

// 1. GET /api/opportunities
//    Fetches the main list of opportunities from the FAST app database (Firestore).
//    This data is populated by the scheduled sync function.
app.get('/api/opportunities', async (req, res) => {
    try {
        const snapshot = await firestore.collection('opportunities').get();
        const opportunities = snapshot.docs.map(doc => doc.data());
        res.status(200).json(opportunities);
    } catch (error) {
        console.error('Error fetching opportunities:', error);
        res.status(500).send('Internal Server Error');
    }
});

// 2. GET /api/accounts/:accountId/details
//    Implements the "On-Demand Cache" strategy for detailed data.
app.get('/api/accounts/:accountId/details', async (req, res) => {
    const { accountId } = req.params;
    const cacheDurationHours = 24;

    try {
        // Step 1: Check for fresh data in the cache (Firestore)
        const cacheRef = firestore.collection('account_details_cache').doc(accountId);
        const cacheDoc = await cacheRef.get();

        if (cacheDoc.exists) {
            const cacheData = cacheDoc.data();
            const lastFetched = cacheData.timestamp.toDate();
            const hoursSinceFetched = (new Date().getTime() - lastFetched.getTime()) / (1000 * 60 * 60);

            if (hoursSinceFetched < cacheDurationHours) {
                console.log(`Cache HIT for account ${accountId}`);
                // Return cached data (excluding the timestamp)
                const { timestamp, ...details } = cacheData;
                return res.status(200).json(details);
            }
        }
        
        console.log(`Cache MISS for account ${accountId}. Querying BigQuery...`);

        // Step 2: If cache is stale or missing, query BigQuery directly.
        // We run multiple queries in parallel for efficiency.

        // Your exact SQL for support tickets, parameterized with the accountId
        const supportTicketsQuery = `
            CREATE TEMP FUNCTION MEDIAN(a_num ARRAY<FLOAT64>)
                RETURNS FLOAT64 AS ((
                  SELECT AVG(num)
                  FROM (
                    SELECT row_number() OVER (ORDER BY num) -1 as rn
                    ,      num
                    FROM UNNEST(a_num) num
                  )
                  WHERE rn = TRUNC(ARRAY_LENGTH(a_num)/2)
                    OR (
                      MOD(ARRAY_LENGTH(a_num), 2) = 0
                      AND rn = TRUNC(ARRAY_LENGTH(a_num)/2)-1
                    )
                ));

            SELECT
                accounts.salesforce_account_id  AS accounts_salesforce_account_id,
                accounts.outreach_account_link  AS accounts_outreach_account_link,
                accounts.salesforce_account_name  AS accounts_salesforce_account_name,
                accounts.owner_name  AS accounts_owner_name,
                tickets.ticket_url  AS tickets_ticket_url,
                tickets.ticket_number  AS tickets_ticket_number,
                    (DATE(tickets.created_date , 'America/Los_Angeles')) AS tickets_created_date,
                tickets.status  AS tickets_status,
                tickets.subject  AS tickets_subject,
                DATETIME_DIFF(DATETIME(CURRENT_TIMESTAMP(), 'America/Los_Angeles'), DATETIME((TIMESTAMP_TRUNC(tickets.created_date , DAY, 'America/Los_Angeles')), 'America/Los_Angeles'), DAY) AS days_open,
                    (DATE(tickets.last_response_from_support_at , 'America/Los_Angeles')) AS tickets_last_response_from_support_at_date,
                    (CASE WHEN tickets.is_escalated  THEN 'Yes' ELSE 'No' END) AS tickets_is_escalated,
                DATETIME_DIFF(DATETIME(CURRENT_TIMESTAMP(), 'America/Los_Angeles'), DATETIME((TIMESTAMP_TRUNC(tickets.last_response_from_support_at , DAY, 'America/Los_Angeles')), 'America/Los_Angeles'), DAY) AS days_since_last_responce,
                tickets.priority  AS tickets_priority
            FROM \`digital-arbor-400\`.transforms_bi.tickets  AS tickets
            LEFT JOIN \`digital-arbor-400\`.transforms_bi.accounts  AS accounts ON tickets.salesforce_account_id = accounts.salesforce_account_id
            WHERE (tickets.salesforce_account_id = @accountId) AND ((UPPER(( tickets.status  )) <> UPPER('closed') OR ( tickets.status  ) IS NULL)) AND (NOT (tickets.is_duplicate ) OR (tickets.is_duplicate ) IS NULL) AND (tickets.is_support_group ) 
            GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12,13,14 ORDER BY 7 DESC
        `;
        
        // Your exact SQL for project history
        const projectHistoryQuery = `
            SELECT
                accounts_salesforce_account_id,
                accounts_outreach_account_link,
                accounts_salesforce_account_name,
                opportunities_id,
                opportunities_name,
                opportunities_project_owner_email,
                opportunities_close_date,
                opportunities_rl_open_project_new_end_date,
                opportunities_subscription_end_date,
                opportunities_budgeted_hours,
                opportunities_billable_hours,
                opportunities_non_billable_hours,
                opportunities_remaining_billable_hours
            FROM
                (SELECT
                        opportunities.id  AS opportunities_id,
                            (opportunities.close_date ) AS opportunities_close_date,
                        opportunities.name  AS opportunities_name,
                            (opportunities.subscription_end_date ) AS opportunities_subscription_end_date,
                            (DATE(opportunities.rl_open_project_new_end_date , 'America/Los_Angeles')) AS opportunities_rl_open_project_new_end_date,
                        opportunities.project_owner_email  AS opportunities_project_owner_email,
                        accounts.salesforce_account_id  AS accounts_salesforce_account_id,
                        accounts.outreach_account_link  AS accounts_outreach_account_link,
                        accounts.salesforce_account_name  AS accounts_salesforce_account_name,
                        COALESCE(SUM(opportunities.rl_budgeted_hours ), 0) AS opportunities_budgeted_hours,
                        COALESCE(SUM(opportunities.rl_billable_hours ), 0) AS opportunities_billable_hours,
                        COALESCE(SUM(opportunities.rl_non_billable_hours ), 0) AS opportunities_non_billable_hours,
                        COALESCE(SUM(opportunities.rl_remaining_billable_hours ), 0) AS opportunities_remaining_billable_hours
                    FROM \`digital-arbor-400\`.transforms_bi.opportunities  AS opportunities
            INNER JOIN \`digital-arbor-400\`.transforms_bi.accounts  AS accounts ON opportunities.salesforce_account_id = accounts.salesforce_account_id
                    WHERE ((UPPER(( accounts.salesforce_account_id  )) = @accountId)))
                    GROUP BY 1,2,3,4,5,6,7,8,9
                    HAVING opportunities_budgeted_hours > 0) AS t3
            ORDER BY opportunities_close_date DESC
        `;

        // Your exact SQL for usage history
        const usageHistoryQuery = \`
            SELECT
                (FORMAT_TIMESTAMP('%Y-%m', timestamp(accounts_timeline.date) )) AS accounts_timeline_date_month,
                connections_table_timeline.table_name  AS connections_table_timeline_table_name,
                connections.group_name  AS connections_group_name,
                connections.warehouse_subtype  AS connections_warehouse_subtype,
                connections_timeline.service_eom  AS connections_timeline_service_eom,
                COALESCE(SUM(connections_table_timeline.raw_volume_updated ), 0) AS connections_table_timeline_raw_volume_updated,
                COALESCE(SUM(connections_table_timeline.free_volume + connections_table_timeline.free_plan_volume + connections_table_timeline.paid_volume), 0) AS connections_table_timeline_total_billable_volume
            FROM \`digital-arbor-400\`.transforms_bi.accounts  AS accounts
            LEFT JOIN \`digital-arbor-400\`.transforms_bi.sf_account_timeline  AS accounts_timeline ON accounts_timeline.salesforce_account_id = accounts.salesforce_account_id
            LEFT JOIN \`digital-arbor-400\`.transforms_bi.connections_timeline  AS connections_timeline ON accounts_timeline.date = connections_timeline.date
                  and accounts_timeline.salesforce_account_id = connections_timeline.salesforce_account_id
            LEFT JOIN \`digital-arbor-400\`.transforms_bi.connections_table_timeline  AS connections_table_timeline ON connections_timeline.connector_id = connections_table_timeline.connector_id
                  and connections_timeline.date = connections_table_timeline.date
            LEFT JOIN \`digital-arbor-400\`.transforms_bi.connections  AS connections ON connections_timeline.connector_id= connections.connector_id
            WHERE ((UPPER(( accounts.salesforce_account_id )) = @accountId))) AND ((( timestamp(accounts_timeline.date)  ) >= ((TIMESTAMP(DATETIME_ADD(DATETIME(TIMESTAMP_TRUNC(TIMESTAMP_TRUNC(TIMESTAMP(FORMAT_TIMESTAMP('%F %H:%M:%E*S', CURRENT_TIMESTAMP(), 'America/Los_Angeles')), DAY), MONTH)), INTERVAL -1 MONTH)))) AND ( timestamp(accounts_timeline.date)  ) < ((TIMESTAMP(DATETIME_ADD(DATETIME(TIMESTAMP(DATETIME_ADD(DATETIME(TIMESTAMP_TRUNC(TIMESTAMP_TRUNC(TIMESTAMP(FORMAT_TIMESTAMP('%F %H:%M:%E*S', CURRENT_TIMESTAMP(), 'America/Los_Angeles')), DAY), MONTH)), INTERVAL -1 MONTH))), INTERVAL 2 MONTH)))))) AND (connections_timeline.has_volume )
            GROUP BY 1,2,3,4,5 LIMIT 30000
        \`;

        const queryOptions = {
            params: { accountId: accountId },
        };

        const [supportTickets] = await bigquery.query({ query: supportTicketsQuery, ...queryOptions });
        const [projectHistory] = await bigquery.query({ query: projectHistoryQuery, ...queryOptions });
        const [usageHistory] = await bigquery.query({ query: usageHistoryQuery, ...queryOptions });

        const details = {
            supportTickets,
            projectHistory,
            usageHistory
        };

        // Step 3: Save the fresh results back to the cache (Firestore) with a new timestamp
        await cacheRef.set({
            ...details,
            timestamp: new Date(),
        });

        // Step 4: Return the fresh data to the client
        res.status(200).json(details);

    } catch (error) {
        console.error(\`Error fetching details for account \${accountId}:\`, error);
        res.status(500).send('Internal Server Error');
    }
});


// 3. POST /api/opportunities/:oppId/disposition
//    Saves the user's disposition data into the app database.
app.post('/api/opportunities/:oppId/disposition', async (req, res) => {
    const { oppId } = req.params;
    const dispositionData = req.body; // In a real app, you'd validate this data
    
    try {
        const oppRef = firestore.collection('opportunities').doc(oppId);
        // Here, we merge the disposition data into the existing opportunity document.
        await oppRef.set({ disposition: dispositionData }, { merge: true });
        
        // We could also write this to a separate "dispositions" collection
        // to be synced back to BigQuery later.

        res.status(200).send({ message: 'Disposition saved successfully.' });
    } catch (error) {
        console.error(\`Error saving disposition for opp \${oppId}:\`, error);
        res.status(500).send('Internal Server Error');
    }
});


app.listen(PORT, () => {
    console.log(\`Server listening on port \${PORT}\`);
});

*/
