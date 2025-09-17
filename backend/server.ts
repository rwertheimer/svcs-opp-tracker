/// <reference types="node" />

// FIX: Consolidating express imports to resolve type issues. Using aliases for Request,
// Response, and NextFunction avoids conflicts with global DOM types.
import express, { Request as ExpressRequest, Response as ExpressResponse, NextFunction as ExpressNextFunction } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';
import type { User, Opportunity, ActionItem, Disposition } from '../types';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

const GCLOUD_PROJECT_ID = 'digital-arbor-400';
const pgPool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  ssl: { rejectUnauthorized: false },
});
const bigquery = new BigQuery({ projectId: GCLOUD_PROJECT_ID });

app.use(cors());
app.use(express.json());

// --- MIDDLEWARE to simulate getting a user from a request header ---
// NOTE: Aliased express types are used to resolve conflicts with other global types (e.g., from DOM).
const userMiddleware = (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => {
    // In a real app, this would come from a JWT or session cookie.
    const userIdHeader = req.headers['x-user-id'];
    if (userIdHeader) {
        // Ensure userId is a string, as headers can be an array.
        (req as any).userId = Array.isArray(userIdHeader) ? userIdHeader[0] : userIdHeader;
    }
    next();
};
app.use(userMiddleware);


const apiRouter = express.Router();

// --- NEW User Endpoint ---
apiRouter.get('/users', async (req: ExpressRequest, res: ExpressResponse) => {
    try {
        const result = await pgPool.query<User>('SELECT user_id, name, email FROM users ORDER BY name');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).send('Internal Server Error');
    }
});


// --- Opportunity Endpoint ---
apiRouter.get('/opportunities', async (req: ExpressRequest, res: ExpressResponse) => {
    const GET_OPPS_QUERY = `
        SELECT 
            o.*,
            -- Subquery to aggregate action items for each opportunity
            (
                SELECT COALESCE(jsonb_agg(ai.* ORDER BY ai.due_date ASC NULLS LAST), '[]'::jsonb)
                FROM action_items ai
                WHERE ai.opportunity_id = o.opportunities_id
            ) as "actionItems"
        FROM opportunities o
        ORDER BY o.opportunities_close_date ASC;
    `;
    try {
        const result = await pgPool.query<Opportunity>(GET_OPPS_QUERY);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching opportunities:', error);
        res.status(500).send('Internal Server Error');
    }
});


// --- REWRITTEN Disposition Endpoint with Optimistic Locking ---
apiRouter.post('/opportunities/:opportunityId/disposition', async (req: ExpressRequest, res: ExpressResponse) => {
    const { opportunityId } = req.params;
    const { disposition, userId } = req.body;

    if (!disposition || !userId || !disposition.version) {
        return res.status(400).send('Disposition, user ID, and version are required.');
    }
    
    const client = await pgPool.connect();

    try {
        await client.query('BEGIN');

        // 1. Get current version from DB
        const { rows } = await client.query('SELECT disposition FROM opportunities WHERE opportunities_id = $1 FOR UPDATE', [opportunityId]);
        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).send('Opportunity not found.');
        }

        const currentVersion = rows[0].disposition.version || 0;

        // 2. Compare versions (Optimistic Lock)
        if (currentVersion !== disposition.version) {
            await client.query('ROLLBACK');
            return res.status(409).send('Conflict: This opportunity has been updated by another user.');
        }

        // 3. Versions match, proceed with update
        const newVersion = currentVersion + 1;
        const updatedDisposition: Disposition = {
            ...disposition,
            version: newVersion,
            last_updated_by_user_id: userId,
            last_updated_at: new Date().toISOString()
        };

        await client.query(
            'UPDATE opportunities SET disposition = $1 WHERE opportunities_id = $2',
            [updatedDisposition, opportunityId]
        );

        // 4. Log the change to the history table
        const changeDetails = {
            status: updatedDisposition.status,
            notes: updatedDisposition.notes,
        };
        await client.query(
            'INSERT INTO disposition_history (opportunity_id, updated_by_user_id, change_details) VALUES ($1, $2, $3)',
            [opportunityId, userId, changeDetails]
        );
        
        await client.query('COMMIT');
        res.status(200).json(updatedDisposition);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error saving disposition for opp ${opportunityId}:`, error);
        res.status(500).send('Internal Server Error');
    } finally {
        client.release();
    }
});


// --- NEW Action Item CRUD Endpoints ---
apiRouter.post('/action-items', async (req: ExpressRequest, res: ExpressResponse) => {
    const { opportunity_id, name, status, due_date, notes, documents, created_by_user_id, assigned_to_user_id } = req.body;
    try {
        const result = await pgPool.query<ActionItem>(
            'INSERT INTO action_items (opportunity_id, name, status, due_date, notes, documents, created_by_user_id, assigned_to_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [opportunity_id, name, status, due_date || null, notes, documents || [], created_by_user_id, assigned_to_user_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating action item:', error);
        res.status(500).send('Internal Server Error');
    }
});

apiRouter.put('/action-items/:itemId', async (req: ExpressRequest, res: ExpressResponse) => {
    const { itemId } = req.params;
    const fields = Object.keys(req.body);
    const setClause = fields.map((field, index) => `"${field}" = $${index + 1}`).join(', ');
    const values = Object.values(req.body);

    if (fields.length === 0) return res.status(400).send('No update fields provided.');

    try {
        const result = await pgPool.query<ActionItem>(
            `UPDATE action_items SET ${setClause} WHERE action_item_id = $${fields.length + 1} RETURNING *`,
            [...values, itemId]
        );
        if (result.rows.length === 0) return res.status(404).send('Action item not found.');
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error(`Error updating action item ${itemId}:`, error);
        res.status(500).send('Internal Server Error');
    }
});

apiRouter.delete('/action-items/:itemId', async (req: ExpressRequest, res: ExpressResponse) => {
    const { itemId } = req.params;
    try {
        const result = await pgPool.query('DELETE FROM action_items WHERE action_item_id = $1', [itemId]);
        if (result.rowCount === 0) return res.status(404).send('Action item not found.');
        res.status(204).send();
    } catch (error) {
        console.error(`Error deleting action item ${itemId}:`, error);
        res.status(500).send('Internal Server Error');
    }
});


// --- Account Detail Endpoints ---
apiRouter.get('/accounts/:accountId/support-tickets', async (req: ExpressRequest, res: ExpressResponse) => {
    const { accountId } = req.params;
    const query = `
        SELECT
            t.salesforce_account_id AS accounts_salesforce_account_id,
            a.outreach_account_link AS accounts_outreach_account_link,
            a.salesforce_account_name AS accounts_salesforce_account_name,
            a.owner_name AS accounts_owner_name,
            t.ticket_url AS tickets_ticket_url,
            t.ticket_number AS tickets_ticket_number,
            CAST(t.created_date AS STRING) AS tickets_created_date,
            t.status AS tickets_status,
            t.subject AS tickets_subject,
            DATE_DIFF(CURRENT_DATE(), DATE(t.created_date), DAY) AS days_open,
            CAST(t.last_response_from_support_at_date AS STRING) AS tickets_last_response_from_support_at_date,
            (CASE WHEN t.is_escalated THEN 'Yes' ELSE 'No' END) AS tickets_is_escalated,
            DATE_DIFF(CURRENT_DATE(), DATE(t.last_response_from_support_at_date), DAY) AS days_since_last_response,
            t.priority AS tickets_priority,
            t.new_csat_numeric AS tickets_new_csat_numeric,
            t.engineering_issue_links_c AS tickets_engineering_issue_links_c
        FROM \`digital-arbor-400.transforms_bi.tickets\` t
        JOIN \`digital-arbor-400.transforms_bi.accounts\` a ON t.salesforce_account_id = a.salesforce_account_id
        WHERE t.salesforce_account_id = @accountId
        ORDER BY t.created_date DESC;
    `;
    try {
        const [rows] = await bigquery.query({ query, params: { accountId } });
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Error fetching support tickets for account ${accountId}:`, error);
        res.status(500).send('Internal Server Error fetching support tickets.');
    }
});

apiRouter.get('/accounts/:accountId/usage-history', async (req: ExpressRequest, res: ExpressResponse) => {
    const { accountId } = req.params;
    const query = `
        SELECT
            month,
            service,
            warehouse_subtype,
            annualized_revenue,
            connections_count
        FROM \`digital-arbor-400.transforms_bi.usage_history\`
        WHERE salesforce_account_id = @accountId
        ORDER BY month DESC;
    `;
    try {
        const [rows] = await bigquery.query({ query, params: { accountId } });
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Error fetching usage history for account ${accountId}:`, error);
        res.status(500).send('Internal Server Error fetching usage history.');
    }
});

apiRouter.get('/accounts/:accountId/project-history', async (req: ExpressRequest, res: ExpressResponse) => {
    const { accountId } = req.params;
    const query = `
        SELECT
            a.salesforce_account_id AS accounts_salesforce_account_id,
            a.outreach_account_link AS accounts_outreach_account_link,
            a.salesforce_account_name AS accounts_salesforce_account_name,
            o.id AS opportunities_id,
            o.name AS opportunities_name,
            o.project_owner_email_c AS opportunities_project_owner_email,
            CAST(o.close_date AS STRING) AS opportunities_close_date,
            CAST(o.rl_open_project_new_end_date_c AS STRING) AS opportunities_rl_open_project_new_end_date,
            CAST(a.subscription_end_date AS STRING) AS opportunities_subscription_end_date,
            o.budgeted_hours_c AS opportunities_budgeted_hours,
            o.billable_hours_c AS opportunities_billable_hours,
            o.non_billable_hours_c AS opportunities_non_billable_hours,
            o.remaining_billable_hours_c AS opportunities_remaining_billable_hours
        FROM \`digital-arbor-400.transforms_bi.opportunities\` o
        JOIN \`digital-arbor-400.transforms_bi.accounts\` a ON o.salesforce_account_id = a.salesforce_account_id
        WHERE o.salesforce_account_id = @accountId
        AND UPPER(o.stage_name) LIKE '%CLOSED%WON%'
        AND o.has_services_flag = TRUE
        ORDER BY o.close_date DESC;
    `;
    try {
        const [rows] = await bigquery.query({ query, params: { accountId } });
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Error fetching project history for account ${accountId}:`, error);
        res.status(500).send('Internal Server Error fetching project history.');
    }
});


// --- SERVER START ---
app.use('/api', apiRouter);

(async () => {
    try {
        // Test the connection
        const client = await pgPool.connect();
        console.log('Successfully connected to PostgreSQL database.');
        client.release();

        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to connect to PostgreSQL database:', error);
        process.exit(1);
    }
})();