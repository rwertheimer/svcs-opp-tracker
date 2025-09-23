/// <reference types="node" />

// Use default import for callable express, and a separate type namespace to avoid DOM type conflicts
import express from 'express';
import type * as expressTypes from 'express';
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
// NOTE: Explicit express types are used to resolve conflicts with other global types (e.g., from DOM).
const userMiddleware = (req: expressTypes.Request, res: expressTypes.Response, next: expressTypes.NextFunction) => {
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

// --- Ensure Saved Views schema (idempotent) ---
async function ensureSavedViewsSchema() {
    const client = await pgPool.connect();
    try {
        try {
            await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
        } catch (extErr) {
            console.warn('Warning: could not ensure pgcrypto extension (gen_random_uuid). Proceeding:', extErr);
        }

        await client.query(`
            CREATE TABLE IF NOT EXISTS saved_views (
              view_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
              name         TEXT NOT NULL,
              criteria     JSONB NOT NULL,
              origin       TEXT,
              description  TEXT,
              is_default   BOOLEAN NOT NULL DEFAULT FALSE,
              created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS ux_saved_views_user_lower_name
              ON saved_views (user_id, lower(name))
        `);

        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS ux_saved_views_one_default_per_user
              ON saved_views (user_id)
              WHERE is_default
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS ix_saved_views_user_updated
              ON saved_views (user_id, updated_at DESC)
        `);

        console.log('Ensured saved_views schema.');
    } catch (error) {
        console.warn('Warning: failed to ensure saved_views schema:', error);
    } finally {
        client.release();
    }
}

// --- NEW User Endpoint ---
apiRouter.get('/users', async (req: expressTypes.Request, res: expressTypes.Response) => {
    try {
        const result = await pgPool.query<User>('SELECT user_id, name, email FROM users ORDER BY name');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).send('Internal Server Error');
    }
});


// --- Opportunity Endpoint ---
apiRouter.get('/opportunities', async (req: expressTypes.Request, res: expressTypes.Response) => {
    const GET_OPPS_QUERY = `
        SELECT 
            -- Explicit column list with aliases to match Opportunity interface
            o.opportunities_id,
            o.opportunities_name,
            o.opportunities_subscription_start_date,
            o.opportunities_stage_name,
            o.opportunities_owner_name,
            o.opportunities_renewal_date_on_creation_date,
            o.automated_renewal_status AS opportunities_automated_renewal_status,
            o.accounts_dollars_months_left,
            o.opportunities_has_services_flag,
            o.opportunities_amount_services,
            o.outreach_account_link AS accounts_outreach_account_link,
            o.salesforce_account_name AS accounts_salesforce_account_name,
            o.primary_fivetran_account_status AS accounts_primary_fivetran_account_status,
            o.quoted_products AS opportunities_quoted_products,
            o.product_being_pitched AS opportunities_product_being_pitched,
            o.se_territory_owner_email AS accounts_se_territory_owner_email,
            o.opportunities_connectors,
            o.connector_tshirt_size_list AS opportunities_connector_tshirt_size_list,
            o.destinations AS opportunities_destinations,
            o.opportunities_type,
            o.region_name AS accounts_region_name,
            o.salesforce_account_id AS accounts_salesforce_account_id,
            o.manager_of_opp_email AS opportunities_manager_of_opp_email,
            o.accounts_subscription_end_date,
            o.opportunities_close_date,
            o.opportunities_forecast_category,
            o.opportunities_services_forecast_sfdc,
            o.opportunities_incremental_bookings,
            o.opportunities_amount,
            o.disposition,
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


// --- Saved Views Endpoints (Multi-user persistence) ---
// Response shape maps DB columns to frontend SavedFilter fields
const mapSavedViewRow = (row: any) => ({
    id: row.view_id,
    user_id: row.user_id,
    name: row.name,
    criteria: row.criteria,
    origin: row.origin ?? null,
    description: row.description ?? null,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

apiRouter.get('/users/:userId/views', async (req: expressTypes.Request, res: expressTypes.Response) => {
    const { userId } = req.params;
    const run = async () => pgPool.query('SELECT * FROM saved_views WHERE user_id = $1 ORDER BY is_default DESC, updated_at DESC', [userId]);
    try {
        const result = await run();
        res.status(200).json(result.rows.map(mapSavedViewRow));
    } catch (error: any) {
        if (error?.code === '42P01') {
            await ensureSavedViewsSchema();
            try {
                const result = await run();
                return res.status(200).json(result.rows.map(mapSavedViewRow));
            } catch (e2) {
                console.error(`Error fetching saved views for user ${userId} after ensure:`, e2);
                return res.status(500).send('Internal Server Error fetching saved views.');
            }
        }
        console.error(`Error fetching saved views for user ${userId}:`, error);
        res.status(500).send('Internal Server Error fetching saved views.');
    }
});

apiRouter.post('/users/:userId/views', async (req: expressTypes.Request, res: expressTypes.Response) => {
    const { userId } = req.params;
    const { name, criteria, origin, description, is_default } = req.body || {};
    if (!name || !criteria) return res.status(400).send('Name and criteria are required.');

    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        if (is_default === true) {
            await client.query('UPDATE saved_views SET is_default = FALSE WHERE user_id = $1 AND is_default = TRUE', [userId]);
        }
        const insert = await client.query(
            'INSERT INTO saved_views (user_id, name, criteria, origin, description, is_default) VALUES ($1, $2, $3, $4, $5, COALESCE($6, FALSE)) RETURNING *',
            [userId, name, criteria, origin ?? null, description ?? null, is_default === true]
        );
        await client.query('COMMIT');
        res.status(201).json(mapSavedViewRow(insert.rows[0]));
    } catch (error: any) {
        await client.query('ROLLBACK');
        if (error?.code === '23505') {
            return res.status(409).send('A view with that name already exists.');
        }
        console.error(`Error creating saved view for user ${userId}:`, error);
        res.status(500).send('Internal Server Error creating saved view.');
    } finally {
        client.release();
    }
});

apiRouter.put('/users/:userId/views/:viewId', async (req: expressTypes.Request, res: expressTypes.Response) => {
    const { userId, viewId } = req.params;
    const { name, criteria, origin, description, is_default } = req.body || {};

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (criteria !== undefined) { fields.push(`criteria = $${idx++}`); values.push(criteria); }
    if (origin !== undefined) { fields.push(`origin = $${idx++}`); values.push(origin); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    fields.push(`updated_at = NOW()`);

    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        if (is_default === true) {
            await client.query('UPDATE saved_views SET is_default = FALSE WHERE user_id = $1 AND view_id <> $2 AND is_default = TRUE', [userId, viewId]);
            fields.push(`is_default = TRUE`);
        } else if (is_default === false) {
            fields.push(`is_default = FALSE`);
        }

        if (fields.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).send('No fields to update.');
        }

        const sql = `UPDATE saved_views SET ${fields.join(', ')} WHERE user_id = $${idx} AND view_id = $${idx + 1} RETURNING *`;
        values.push(userId, viewId);
        const result = await client.query(sql, values);
        await client.query('COMMIT');
        if (result.rows.length === 0) return res.status(404).send('Saved view not found.');
        res.status(200).json(mapSavedViewRow(result.rows[0]));
    } catch (error: any) {
        await client.query('ROLLBACK');
        if (error?.code === '23505') {
            return res.status(409).send('A view with that name already exists.');
        }
        console.error(`Error updating saved view ${viewId} for user ${userId}:`, error);
        res.status(500).send('Internal Server Error updating saved view.');
    } finally {
        client.release();
    }
});

apiRouter.delete('/users/:userId/views/:viewId', async (req: expressTypes.Request, res: expressTypes.Response) => {
    const { userId, viewId } = req.params;
    try {
        const result = await pgPool.query('DELETE FROM saved_views WHERE user_id = $1 AND view_id = $2', [userId, viewId]);
        if (result.rowCount === 0) return res.status(404).send('Saved view not found.');
        res.status(204).send();
    } catch (error) {
        console.error(`Error deleting saved view ${viewId} for user ${userId}:`, error);
        res.status(500).send('Internal Server Error deleting saved view.');
    }
});

apiRouter.put('/users/:userId/views/:viewId/default', async (req: expressTypes.Request, res: expressTypes.Response) => {
    const { userId, viewId } = req.params;
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE saved_views SET is_default = FALSE WHERE user_id = $1 AND is_default = TRUE', [userId]);
        const result = await client.query('UPDATE saved_views SET is_default = TRUE, updated_at = NOW() WHERE user_id = $1 AND view_id = $2 RETURNING *', [userId, viewId]);
        await client.query('COMMIT');
        if (result.rows.length === 0) return res.status(404).send('Saved view not found.');
        res.status(200).json(mapSavedViewRow(result.rows[0]));
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Error setting default saved view ${viewId} for user ${userId}:`, error);
        res.status(500).send('Internal Server Error setting default saved view.');
    } finally {
        client.release();
    }
});

// --- REWRITTEN Disposition Endpoint with Optimistic Locking ---
apiRouter.post('/opportunities/:opportunityId/disposition', async (req: expressTypes.Request, res: expressTypes.Response) => {
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
apiRouter.post('/action-items', async (req: expressTypes.Request, res: expressTypes.Response) => {
    const { opportunity_id, name, status, due_date, documents, created_by_user_id, assigned_to_user_id } = req.body;
    try {
        const result = await pgPool.query<ActionItem>(
            'INSERT INTO action_items (opportunity_id, name, status, due_date, documents, created_by_user_id, assigned_to_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [opportunity_id, name, status, due_date || null, documents || [], created_by_user_id, assigned_to_user_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating action item:', error);
        res.status(500).send('Internal Server Error');
    }
});

apiRouter.put('/action-items/:itemId', async (req: expressTypes.Request, res: expressTypes.Response) => {
    const { itemId } = req.params;
    const fields = Object.keys(req.body).filter(field => field !== 'notes');
    const setClause = fields.map((field, index) => `"${field}" = $${index + 1}`).join(', ');
    const values = fields.map(field => req.body[field]);

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

apiRouter.delete('/action-items/:itemId', async (req: expressTypes.Request, res: expressTypes.Response) => {
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
apiRouter.get('/accounts/:accountId/support-tickets', async (req: expressTypes.Request, res: expressTypes.Response) => {
    const { accountId } = req.params;
    console.log(`[Live Endpoint] GET Support Tickets for account ${accountId}`);
    const query = `
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
        const [rows] = await bigquery.query({ query, params: { accountId } });
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Error fetching support tickets for account ${accountId}:`, error);
        res.status(500).send('Internal Server Error fetching support tickets.');
    }
});

apiRouter.get('/accounts/:accountId/usage-history', async (req: expressTypes.Request, res: expressTypes.Response) => {
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
        const [rows] = await bigquery.query({ query: GET_USAGE_QUERY, params: { accountId } });
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Error fetching usage history for account ${accountId}:`, error);
        res.status(500).send('Internal Server Error fetching usage history.');
    }
});

apiRouter.get('/accounts/:accountId/project-history', async (req: expressTypes.Request, res: expressTypes.Response) => {
    const { accountId } = req.params;
    console.log(`[Live Endpoint] GET Project History for account ${accountId}`);
    const query = `
        SELECT
            a.salesforce_account_id AS accounts_salesforce_account_id,
            a.outreach_account_link AS accounts_outreach_account_link,
            a.salesforce_account_name AS accounts_salesforce_account_name,
            o.id AS opportunities_id,
            o.name AS opportunities_name,
            o.project_owner_email AS opportunities_project_owner_email,
            CAST(DATE(o.close_date) AS STRING) AS opportunities_close_date,
            CAST(DATE(o.rl_open_project_new_end_date, 'America/Los_Angeles') AS STRING) AS opportunities_rl_open_project_new_end_date,
            CAST(DATE(o.subscription_end_date) AS STRING) AS opportunities_subscription_end_date,
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
        // Ensure helpful indexes exist for performance-sensitive queries
        try {
            await client.query('CREATE INDEX IF NOT EXISTS idx_action_items_opportunity_due ON action_items (opportunity_id, due_date)');
            console.log('Ensured index idx_action_items_opportunity_due exists.');
        } catch (e) {
            console.warn('Warning: Failed to ensure action_items index:', e);
        }
        client.release();

        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to connect to PostgreSQL database:', error);
        process.exit(1);
    }
})();
