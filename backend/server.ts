// Fix: Add a triple-slash directive to explicitly include Node.js types.
// This resolves type conflicts with Express and allows globals like `process` to be recognized.
/// <reference types="node" />

import express from 'express';
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

// Initialize BigQuery client
const bigquery = new BigQuery({ projectId: GCLOUD_PROJECT_ID });


// --- SERVER SETUP ---
app.use(cors()); // Allow requests from the frontend dev server
// FIX: Apply express.json() middleware globally to parse JSON bodies.
// This resolves a TypeScript type issue that occurred when it was combined with the router mount.
app.use(express.json());


// --- API ROUTER SETUP ---
// Using an Express Router is a best practice for organizing routes.
const apiRouter = express.Router();

// GET /api/opportunities
// Fetches the main list of opportunities from the PostgreSQL database.
apiRouter.get('/opportunities', async (req, res) => {
    try {
        const result = await pgClient.query('SELECT * FROM opportunities ORDER BY opportunities_amount DESC, opportunities_incremental_bookings DESC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching opportunities:', error);
        res.status(500).send('Internal Server Error. Could not connect to the database.');
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
            DATE_DIFF(CURRENT_DATE('America/Los_Angeles'), DATE(t.last_response_from_support_at, 'America/Los_Angeles'), DAY) AS days_since_last_responce,
            t.priority AS tickets_priority
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
        -- Define the date range for the last 3 full months.
        DECLARE start_date DATE DEFAULT DATE_TRUNC(DATE_SUB(CURRENT_DATE('America/Los_Angeles'), INTERVAL 2 MONTH), MONTH);
        DECLARE end_date DATE DEFAULT DATE_TRUNC(DATE_ADD(CURRENT_DATE('America/Los_Angeles'), INTERVAL 1 MONTH), MONTH);

        SELECT
            FORMAT_DATE('%Y-%m', accounts_timeline.date) AS accounts_timeline_date_month,
            connections_table_timeline.table_name AS connections_table_timeline_table_name,
            connections.group_name AS connections_group_name,
            connections.warehouse_subtype AS connections_warehouse_subtype,
            connections_timeline.service_eom AS connections_timeline_service_eom,
            COALESCE(SUM(connections_table_timeline.raw_volume_updated), 0) AS connections_table_timeline_raw_volume_updated,
            COALESCE(SUM(connections_table_timeline.free_volume + connections_table_timeline.free_plan_volume + connections_table_timeline.paid_volume), 0) AS connections_table_timeline_total_billable_volume
        FROM \`digital-arbor-400.transforms_bi.accounts\` AS accounts
        LEFT JOIN \`digital-arbor-400.transforms_bi.sf_account_timeline\` AS accounts_timeline
            ON accounts_timeline.salesforce_account_id = accounts.salesforce_account_id
        LEFT JOIN \`digital-arbor-400.transforms_bi.connections_timeline\` AS connections_timeline
            ON accounts_timeline.date = connections_timeline.date AND accounts_timeline.salesforce_account_id = connections_timeline.salesforce_account_id
        LEFT JOIN \`digital-arbor-400.transforms_bi.connections_table_timeline\` AS connections_table_timeline
            ON connections_timeline.connector_id = connections_table_timeline.connector_id AND connections_timeline.date = connections_table_timeline.date
        LEFT JOIN \`digital-arbor-400.transforms_bi.connections\` AS connections
            ON connections_timeline.connector_id = connections.connector_id
        WHERE
            accounts.salesforce_account_id = @accountId
            AND accounts_timeline.date >= start_date
            AND accounts_timeline.date < end_date
            AND connections_timeline.has_volume
        GROUP BY 1, 2, 3, 4, 5;
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

// Mount the router on the /api path. All routes defined on apiRouter will be prefixed with /api.
app.use('/api', apiRouter);


// --- START SERVER ---
const startServer = async () => {
    const requiredEnvVars = ['PG_HOST', 'PG_USER', 'PG_DATABASE', 'PG_PASSWORD', 'PG_PORT'];
    const missingVars = requiredEnvVars.filter(v => !process.env[v]);

    if (missingVars.length > 0) {
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        console.error(`!!! ERROR: Missing required environment variables: ${missingVars.join(', ')}`);
        console.error('!!! Please create a .env file and fill in the details.');
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        return; // Prevent server from starting
    }

    try {
        await pgClient.connect();
        console.log('Successfully connected to PostgreSQL database.');
        app.listen(PORT, () => {
            console.log(`Backend server listening on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to connect to PostgreSQL database:', error);
        // Fix: Suppress TypeScript error for process.exit, which is valid in Node.js.
        // This is necessary due to a project-wide type resolution issue.
        // @ts-ignore
        process.exit(1);
    }
}

startServer();