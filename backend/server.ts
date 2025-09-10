// Fix: Add a triple-slash directive to explicitly include Node.js types.
// This resolves type conflicts with Express and allows globals like `process` to be recognized.
/// <reference types="node" />

import express from 'express';
import cors from 'cors';
import { Client } from 'pg';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// --- CONFIGURATION ---
// Database connection details are now loaded securely from environment variables.
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


// --- MOCK DATA GENERATION for detail endpoints ---
// This section simulates the on-demand BigQuery calls for the details view.
const getRandomElement = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const createPastDate = (daysAgo: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
};
const getRandomId = () => Math.random().toString(36).substring(2, 10);

const generateSupportTickets = (accountId: string) => {
    return Array.from({ length: 3 }, (_, i) => ({
        accounts_salesforce_account_id: accountId,
        accounts_outreach_account_link: 'http://example.com',
        accounts_salesforce_account_name: 'Mock Account',
        accounts_owner_name: 'Mock Owner',
        tickets_ticket_url: 'http://example.com',
        tickets_ticket_number: 12345 + i,
        tickets_created_date: createPastDate(i * 10 + 5),
        tickets_status: 'Open',
        tickets_subject: `Issue with connector sync #${i+1}`,
        days_open: i * 10 + 5,
        tickets_last_response_from_support_at_date: createPastDate(i + 1),
        tickets_is_escalated: 'No',
        days_since_last_responce: i + 1,
        tickets_priority: getRandomElement(['High', 'Medium', 'Low']),
    }));
};

const generateUsageHistory = (accountId: string) => {
    const MOCK_INTEGRATIONS = [
      { name: 'orders', group: 'Salesforce', service: 'salesforce' },
      { name: 'ad_spend', group: 'Google Ads', service: 'google_ads' },
      { name: 'customer_data', group: 'Zendesk', service: 'zendesk' },
    ];
    const MOCK_WAREHOUSES = ['SNOWFLAKE', 'BIGQUERY', 'REDSHIFT'];
    const usageHistory: any[] = [];
    const numIntegrations = Math.floor(Math.random() * 2) + 1;
    const selectedIntegrations = MOCK_INTEGRATIONS.sort(() => 0.5 - Math.random()).slice(0, numIntegrations);
    const warehouse = getRandomElement(MOCK_WAREHOUSES);

    for(const integration of selectedIntegrations) {
        let lastMonthBillable = Math.random() * 1e9 + 1e7;
        for (let i = 0; i < 3; i++) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            const fluctuation = (Math.random() - 0.4);
            const billable = Math.max(0, lastMonthBillable * (1 + fluctuation));
            const raw = billable * (Math.random() * 2 + 1.2);
            lastMonthBillable = billable;

            usageHistory.push({
                 accounts_timeline_date_month: `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`,
                 connections_table_timeline_table_name: integration.name,
                 connections_group_name: integration.group,
                 connections_warehouse_subtype: warehouse,
                 connections_timeline_service_eom: integration.service,
                 connections_table_timeline_raw_volume_updated: raw,
                 connections_table_timeline_total_billable_volume: billable,
            });
        }
    }
    return usageHistory;
};

const generateProjectHistory = (accountId: string) => {
    return Array.from({ length: 2 }, (_, i) => ({
        accounts_salesforce_account_id: accountId,
        accounts_outreach_account_link: 'http://example.com',
        accounts_salesforce_account_name: 'Mock Account',
        opportunities_id: `proj-${getRandomId()}`,
        opportunities_name: `Historical Project ${i+1}`,
        opportunities_project_owner_email: 'pm@example.com',
        opportunities_close_date: createPastDate(i * 180 + 90),
        opportunities_rl_open_project_new_end_date: createPastDate(i * 180),
        opportunities_subscription_end_date: createPastDate(i * 180 - 30),
        opportunities_budgeted_hours: 100 + i * 20,
        opportunities_billable_hours: 80 + i * 25,
        opportunities_non_billable_hours: 5 + i * 2,
        opportunities_remaining_billable_hours: 20 - i * 5,
    }));
};
// --- END MOCK DATA GENERATION ---


// --- SERVER SETUP ---
app.use(cors()); // Allow requests from the frontend dev server
app.use(express.json()); // Standard way to apply JSON body parsing middleware


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


// --- ACCOUNT DETAIL ENDPOINTS (now on the router) ---

// GET /api/accounts/:accountId/support-tickets
apiRouter.get('/accounts/:accountId/support-tickets', async (req, res) => {
    const { accountId } = req.params;
    console.log(`[Mock Endpoint] GET Support Tickets for account ${accountId}`);
    /* 
     * --- SQL BLUEPRINT ---
     * This is the query to run against your data warehouse (e.g., BigQuery) when ready.
     * It fetches recent support tickets for the specified account.
     *
    const GET_TICKETS_QUERY = `...`
    */
    try {
        const mockTickets = generateSupportTickets(accountId);
        res.status(200).json(mockTickets);
    } catch (error) {
        console.error(`Error generating support tickets for account ${accountId}:`, error);
        res.status(500).send('Internal Server Error');
    }
});

// GET /api/accounts/:accountId/usage-history
apiRouter.get('/accounts/:accountId/usage-history', async (req, res) => {
    const { accountId } = req.params;
    console.log(`[Mock Endpoint] GET Usage History for account ${accountId}`);
    /* 
     * --- SQL BLUEPRINT ---
     * This query fetches the last 3 months of usage data for the specified account.
     *
    const GET_USAGE_QUERY = `...`
    */
    try {
        const mockUsage = generateUsageHistory(accountId);
        res.status(200).json(mockUsage);
    } catch (error) {
        console.error(`Error generating usage history for account ${accountId}:`, error);
        res.status(500).send('Internal Server Error');
    }
});

// GET /api/accounts/:accountId/project-history
apiRouter.get('/accounts/:accountId/project-history', async (req, res) => {
    const { accountId } = req.params;
    console.log(`[Mock Endpoint] GET Project History for account ${accountId}`);
    /* 
     * --- SQL BLUEPRINT ---
     * This query fetches past services projects for the specified account.
     *
    const GET_PROJECTS_QUERY = `...`
    */
    try {
        const mockProjects = generateProjectHistory(accountId);
        res.status(200).json(mockProjects);
    } catch (error) {
        console.error(`Error generating project history for account ${accountId}:`, error);
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