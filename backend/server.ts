// Fix: Add a triple-slash directive to explicitly include Node.js types.
// This resolves type conflicts with Express and allows globals like `process` to be recognized.
/// <reference types="node" />

import express from 'express';
import cors from 'cors';
import { Client } from 'pg';

const app = express();
const PORT = process.env.PORT || 8080;

// --- CONFIGURATION ---
// IMPORTANT: Replace with your actual Postgres connection details from seedPostgres.ts
const POSTGRES_CONFIG = {
  user: 'postgres',
  host: 'YOUR_INSTANCE_PUBLIC_IP',
  database: 'opportunity_tracker',
  password: 'YOUR_POSTGRES_PASSWORD',
  port: 5432,
  ssl: {
    rejectUnauthorized: false,
  },
};

const pgClient = new Client(POSTGRES_CONFIG);

// --- MOCK DATA GENERATION for /details endpoint ---
// This section is copied and adapted from the frontend's mockData.ts
// to simulate the on-demand BigQuery calls for the details view.
const getRandomElement = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const createPastDate = (daysAgo: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
};
const getRandomId = () => Math.random().toString(36).substring(2, 10);
const MOCK_INTEGRATIONS = [
    { name: 'orders', group: 'Salesforce', service: 'salesforce' },
    { name: 'leads', group: 'Salesforce', service: 'salesforce' },
    { name: 'ad_spend', group: 'Google Ads', service: 'google_ads' },
    { name: 'audit_logs', group: 'BigQuery', service: 'bigquery' },
    { name: 'customer_data', group: 'Zendesk', service: 'zendesk' },
];
const MOCK_WAREHOUSES = ['SNOWFLAKE', 'BIGQUERY', 'REDSHIFT'];

const generateAccountDetails = (accountId: string) => {
    const supportTickets = Array.from({ length: 3 }, (_, i) => ({
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

    const usageHistory: any[] = [];
    const numIntegrations = Math.floor(Math.random() * 3) + 2;
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

    const projectHistory = Array.from({ length: 2 }, (_, i) => ({
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
        opportunities_billable_hours: 95 + i * 20,
        opportunities_non_billable_hours: 5,
        opportunities_remaining_billable_hours: 0,
    }));
    
    return {
        supportTickets,
        usageHistory,
        projectHistory,
    };
};
// --- END MOCK DATA GENERATION ---


// --- SERVER SETUP ---
app.use(cors()); // Allow requests from the frontend dev server
// Fix: Use a type assertion to bypass a complex type resolution issue with express.json().
// This is necessary due to conflicting type definitions within the project's dependencies.
app.use('/', express.json() as any);

// --- API ROUTES ---

// GET /api/opportunities
// Fetches the main list of opportunities from the PostgreSQL database.
app.get('/api/opportunities', async (req, res) => {
    try {
        const result = await pgClient.query('SELECT * FROM opportunities ORDER BY opportunities_amount DESC, opportunities_incremental_bookings DESC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching opportunities:', error);
        res.status(500).send('Internal Server Error. Could not connect to the database.');
    }
});

// GET /api/accounts/:accountId/details
// Mocks the on-demand BigQuery calls for detailed account data.
app.get('/api/accounts/:accountId/details', async (req, res) => {
    const { accountId } = req.params;
    console.log(`Generating mock details for account ${accountId}`);
    try {
        const details = generateAccountDetails(accountId);
        res.status(200).json(details);
    } catch (error) {
        console.error(`Error generating details for account ${accountId}:`, error);
        res.status(500).send('Internal Server Error');
    }
});

// --- START SERVER ---
const startServer = async () => {
    if (POSTGRES_CONFIG.host === 'YOUR_INSTANCE_PUBLIC_IP' || POSTGRES_CONFIG.password === 'YOUR_POSTGRES_PASSWORD') {
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        console.error('!!! PLEASE UPDATE POSTGRES_CONFIG in backend/server.ts         !!!');
        console.error('!!! The backend server will not be able to start without it.   !!!');
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        return; // Prevent server from starting with placeholder credentials
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