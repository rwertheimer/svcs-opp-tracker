// Fix: Add a triple-slash directive to explicitly include Node.js types.
// This resolves type conflicts with Express and allows globals like `process` to be recognized.
/// <reference types="node" />

// Fix: Use a named import for `json` to resolve a TypeScript overload error on `app.use`.
import express, { json } from 'express';
import cors from 'cors';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// --- CONFIGURATION ---
const GCLOUD_PROJECT_ID = 'digital-arbor-400';

// Database connection details are loaded securely from environment variables.
const pgClient = new Client({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Initialize BigQuery client.
// Authentication is handled automatically via the GOOGLE_APPLICATION_CREDENTIALS
// environment variable pointing to a service account key file.
const bigquery = new BigQuery({ projectId: GCLOUD_PROJECT_ID });


// --- SERVER SETUP ---
app.use(cors()); // Allow requests from the frontend dev server
// Fix: Replaced `express.json()` with `json()` from the named import to resolve the TypeScript overload error.
app.use(json()); // Add middleware to parse JSON request bodies


// --- API ROUTER SETUP ---
// Using an Express Router is a best practice for organizing routes.
const apiRouter = express.Router();

// GET /api/opportunities
// Fetches the main list of opportunities from the PostgreSQL database.
apiRouter.get('/opportunities', async (req, res) => {
    const GET_OPPS_QUERY = `
        SELECT 
            o.*,
            COALESCE(o.disposition, '{"status": "Not Reviewed", "notes": "", "actionItems": []}'::jsonb) AS disposition
        FROM opportunities o
        ORDER BY o.opportunities_amount DESC, o.opportunities_incremental_bookings DESC;
    `;
    try {
        const result = await pgClient.query(GET_OPPS_QUERY);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching opportunities:', error);
        res.status(500).send('Internal Server Error. Could not connect to the database.');
    }
});

// POST /api/opportunities/:opportunityId/disposition
// Saves the disposition for a specific opportunity.
apiRouter.post('/opportunities/:opportunityId/disposition', async (req, res) => {
    const { opportunityId } = req.params;
    const { disposition } = req.body;

    if (!disposition) {
        return res.status(400).send('Disposition data is missing from the request body.');
    }

    const SAVE_DISPOSITION_QUERY = `
        UPDATE opportunities
        SET disposition = $1
        WHERE opportunities_id = $2;
    `;
    
    try {
        const result = await pgClient.query(SAVE_DISPOSITION_QUERY, [disposition, opportunityId]);
        if (result.rowCount === 0) {
            return res.status(404).send(`Opportunity with ID ${opportunityId} not found.`);
        }
        res.status(200).json({ message: 'Disposition saved successfully.' });
    } catch (error) {
        console.error(`Error saving disposition for opportunity ${opportunityId}:`, error);
        res.status(500).send('Internal Server Error. Could not save disposition.');
    }
});


// --- ACCOUNT DETAIL ENDPOINTS (Live Data from BigQuery) ---

// GET /api/accounts/:accountId/support-tickets
apiRouter.get('/accounts/:accountId/support-tickets', async (req, res) => {
    const { accountId } = req.params;
    console.log(`[Live Endpoint] GET Support Tickets for account ${accountId}`);
    
    const GET_TICKETS_QUERY = `
        SELECT
            a.salesforce_account_id AS accounts_salesforce_account_id,
            a.outreach_account_link AS accounts_outreach_account_link,
            a.salesforce_account_name AS accounts_salesforce_account_name,
            a.owner_name AS accounts_owner_name,
            t.ticket_url AS tickets_ticket_url,
            t.ticket_number AS tickets_ticket_number,
            DATE(t.created_date, 'America/Los_Angeles') AS tickets_created_date,
            t.status AS tickets_status,
            t.subject AS tickets_subject,
            DATE_DIFF(CURRENT_DATE('America/Los_Angeles'), DATE(t.created_date, 'America/Los_Angeles'), DAY) AS days_open,
            DATE(t.last_response_from_support_at, 'America/Los_Angeles') AS tickets_last_response_from_support_at_date,
            (CASE WHEN t.is_escalated THEN 'Yes' ELSE 'No' END) AS tickets_is_escalated,
            DATE_DIFF(CURRENT_DATE('America/Los_Angeles'), DATE(t.last_response_from_support_at, 'America/Los_Angeles'), DAY) AS days_since_last_response,
            t.priority AS tickets_priority,
            t.new_csat_numeric AS tickets_new_csat_numeric,
            t.engineering_issue_links_c AS tickets_engineering_issue_links_c
        FROM \`digital-arbor-400.transforms_bi.tickets\` AS t
        LEFT JOIN \`digital-arbor-400.transforms_bi.accounts\` AS a ON t.salesforce_account_id = a.salesforce_account_id
        WHERE
            (t.is_duplicate IS NOT TRUE)
            AND (t.is_support_group IS TRUE)
            AND UPPER(a.salesforce_account_id) = UPPER(@accountId)
        ORDER BY
            tickets_created_date DESC;
    `;
    
    try {
        const [rows] = await bigquery.query({
            query: GET_TICKETS_QUERY,
            params: { accountId: accountId }
        });
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Error fetching support tickets for account ${accountId}:`, error);
        res.status(500).send('Internal Server Error');
    }
});

// GET /api/accounts/:accountId/usage-history
apiRouter.get('/accounts/:accountId/usage-history', async (req, res) => {
    const { accountId } = req.params;
    console.log(`[Live Endpoint] GET Usage History for account ${accountId}`);
    
    const GET_USAGE_QUERY = `
        DECLARE start_date DATE DEFAULT DATE_TRUNC(DATE_SUB(CURRENT_DATE('America/Los_Angeles'), INTERVAL 2 MONTH), MONTH);

        WITH
        DeduplicatedRevenue AS (
            SELECT DISTINCT
                FORMAT_DATE('%Y-%m', ct.date) AS month,
                ct.service_eom AS service,
                c.warehouse_subtype,
                ct.connector_id,
                ct.distributed_connection_proj_model_arr AS revenue
            FROM \`digital-arbor-400.transforms_bi.connections_timeline\` AS ct
            LEFT JOIN \`digital-arbor-400.transforms_bi.connections\` AS c ON ct.connector_id = c.connector_id
            WHERE ct.salesforce_account_id = @accountId
              AND ct.date >= start_date
              AND ct.has_volume
              AND ct.show_month
        ),
        ConnectionCounts AS (
            SELECT
                FORMAT_DATE('%Y-%m', ct.date) AS month,
                ct.service_eom AS service,
                c.warehouse_subtype,
                COUNT(DISTINCT IF(ct.connection_observed AND ct.group_id IS NOT NULL, ct.connector_id, NULL)) AS connections_count
            FROM \`digital-arbor-400.transforms_bi.connections_timeline\` AS ct
            LEFT JOIN \`digital-arbor-400.transforms_bi.connections\` AS c ON ct.connector_id = c.connector_id
            WHERE ct.salesforce_account_id = @accountId
              AND ct.date >= start_date
            GROUP BY 1, 2, 3
        ),
        AggregatedRevenue AS (
            SELECT
                month,
                service,
                warehouse_subtype,
                SUM(revenue) AS annualized_revenue
            FROM DeduplicatedRevenue
            GROUP BY 1, 2, 3
        )
        SELECT
            COALESCE(ar.month, cc.month) as month,
            COALESCE(ar.service, cc.service) as service,
            COALESCE(ar.warehouse_subtype, cc.warehouse_subtype) as warehouse_subtype,
            COALESCE(ar.annualized_revenue, 0) as annualized_revenue,
            COALESCE(cc.connections_count, 0) as connections_count
        FROM AggregatedRevenue ar
        FULL OUTER JOIN ConnectionCounts cc
          ON ar.month = cc.month 
          AND ar.service = cc.service 
          AND COALESCE(ar.warehouse_subtype, '___NULL___') = COALESCE(cc.warehouse_subtype, '___NULL___');
    `;

     try {
        const [rows] = await bigquery.query({
            query: GET_USAGE_QUERY,
            params: { accountId: accountId }
        });
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Error fetching usage history for account ${accountId}:`, error);
        res.status(500).send('Internal Server Error');
    }
});


// GET /api/accounts/:accountId/project-history
apiRouter.get('/accounts/:accountId/project-history', async (req, res) => {
    const { accountId } = req.params;
    console.log(`[Live Endpoint] GET Project History for account ${accountId}`);
    
    const GET_PROJECTS_QUERY = `
        SELECT
            a.salesforce_account_id,
            a.outreach_account_link,
            a.salesforce_account_name,
            o.id AS opportunities_id,
            o.name AS opportunities_name,
            o.project_owner_email AS opportunities_project_owner_email,
            DATE(o.close_date) AS opportunities_close_date,
            DATE(o.rl_open_project_new_end_date, 'America/Los_Angeles') AS opportunities_rl_open_project_new_end_date,
            DATE(o.subscription_end_date) AS opportunities_subscription_end_date,
            COALESCE(SUM(o.rl_budgeted_hours), 0) AS opportunities_budgeted_hours,
            COALESCE(SUM(o.rl_billable_hours), 0) AS opportunities_billable_hours,
            COALESCE(SUM(o.rl_non_billable_hours), 0) AS opportunities_non_billable_hours,
            COALESCE(SUM(o.rl_remaining_billable_hours), 0) AS opportunities_remaining_billable_hours
        FROM \`digital-arbor-400.transforms_bi.opportunities\` AS o
        INNER JOIN \`digital-arbor-400.transforms_bi.accounts\` AS a ON o.salesforce_account_id = a.salesforce_account_id
        WHERE
            a.salesforce_account_id = @accountId
            AND (
                UPPER(o.rl_status_label) != 'IN PROGRESS' 
                OR UPPER(o.stage_name) LIKE '%WON%'
            )
            AND o.has_services_flag = TRUE
        GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9
        HAVING COALESCE(SUM(o.rl_budgeted_hours), 0) > 0
        ORDER BY opportunities_close_date DESC;
    `;

    try {
        const [rows] = await bigquery.query({
            query: GET_PROJECTS_QUERY,
            params: { accountId: accountId }
        });
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Error fetching project history for account ${accountId}:`, error);
        res.status(500).send('Internal Server Error');
    }
});


// --- START SERVER ---
app.use('/api', apiRouter);

(async () => {
    try {
        await pgClient.connect();
        console.log('Successfully connected to PostgreSQL database.');
        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to connect to PostgreSQL database:', error);
        // Fix: Suppress TypeScript error for process.exit, which is valid in Node.js.
        // @ts-ignore
        process.exit(1);
    }
})();