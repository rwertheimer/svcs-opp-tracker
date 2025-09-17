/// <reference types="node" />

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

const GCLOUD_PROJECT_ID = 'digital-arbor-400';
const pgClient = new Client({
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
// FIX: Removed async as the function doesn't perform any await operations.
const userMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // In a real app, this would come from a JWT or session cookie.
    // For this prototype, we'll pass it in the header for simplicity.
    // FIX: Switched to req.header() to resolve typing issues with req.headers.
    const userId = req.header('x-user-id');
    if (userId) {
        (req as any).userId = userId;
    }
    next();
};
app.use(userMiddleware);


const apiRouter = express.Router();

// --- NEW User Endpoint ---
apiRouter.get('/users', async (req, res) => {
    try {
        const result = await pgClient.query('SELECT user_id, name, email FROM users ORDER BY name');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).send('Internal Server Error');
    }
});


// --- Opportunity Endpoint ---
apiRouter.get('/opportunities', async (req, res) => {
    const GET_OPPS_QUERY = `
        SELECT 
            o.*,
            -- Subquery to aggregate action items for each opportunity
            (
                SELECT COALESCE(jsonb_agg(ai.*), '[]'::jsonb)
                FROM action_items ai
                WHERE ai.opportunity_id = o.opportunities_id
            ) as "actionItems"
        FROM opportunities o
        ORDER BY o.opportunities_amount DESC, o.opportunities_incremental_bookings DESC;
    `;
    try {
        const result = await pgClient.query(GET_OPPS_QUERY);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching opportunities:', error);
        res.status(500).send('Internal Server Error');
    }
});


// --- REWRITTEN Disposition Endpoint with Optimistic Locking ---
// FIX: Refactored to use the single pgClient for transactions, as `pgClient.connect()` returns void and is not a connection pool.
apiRouter.post('/opportunities/:opportunityId/disposition', async (req, res) => {
    const { opportunityId } = req.params;
    const { disposition, userId } = req.body;

    if (!disposition || !userId || !disposition.version) {
        return res.status(400).send('Disposition, user ID, and version are required.');
    }

    try {
        await pgClient.query('BEGIN');

        // 1. Get current version from DB
        const { rows } = await pgClient.query('SELECT disposition FROM opportunities WHERE opportunities_id = $1 FOR UPDATE', [opportunityId]);
        if (rows.length === 0) {
            await pgClient.query('ROLLBACK');
            return res.status(404).send('Opportunity not found.');
        }

        const currentVersion = rows[0].disposition.version || 0;

        // 2. Compare versions (Optimistic Lock)
        if (currentVersion !== disposition.version) {
            await pgClient.query('ROLLBACK');
            return res.status(409).send('Conflict: This opportunity has been updated by another user.');
        }

        // 3. Versions match, proceed with update
        const newVersion = currentVersion + 1;
        const updatedDisposition = {
            ...disposition,
            version: newVersion,
            last_updated_by_user_id: userId,
            last_updated_at: new Date().toISOString()
        };

        const updateResult = await pgClient.query(
            'UPDATE opportunities SET disposition = $1 WHERE opportunities_id = $2',
            [updatedDisposition, opportunityId]
        );

        // 4. Log the change to the history table
        const changeDetails = {
            status: updatedDisposition.status,
            notes: updatedDisposition.notes,
            // Add other changed fields as needed
        };
        await pgClient.query(
            'INSERT INTO disposition_history (opportunity_id, updated_by_user_id, change_details) VALUES ($1, $2, $3)',
            [opportunityId, userId, changeDetails]
        );
        
        await pgClient.query('COMMIT');
        res.status(200).json(updatedDisposition);

    } catch (error) {
        await pgClient.query('ROLLBACK');
        console.error(`Error saving disposition for opp ${opportunityId}:`, error);
        res.status(500).send('Internal Server Error');
    }
});


// --- NEW Action Item CRUD Endpoints ---
apiRouter.post('/action-items', async (req, res) => {
    const { opportunity_id, name, status, due_date, notes, documents, created_by_user_id, assigned_to_user_id } = req.body;
    try {
        const result = await pgClient.query(
            'INSERT INTO action_items (opportunity_id, name, status, due_date, notes, documents, created_by_user_id, assigned_to_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [opportunity_id, name, status, due_date || null, notes, documents || [], created_by_user_id, assigned_to_user_id]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating action item:', error);
        res.status(500).send('Internal Server Error');
    }
});

apiRouter.put('/action-items/:itemId', async (req, res) => {
    const { itemId } = req.params;
    // Build the update query dynamically based on provided fields
    const fields = Object.keys(req.body);
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const values = Object.values(req.body);

    if (fields.length === 0) return res.status(400).send('No update fields provided.');

    try {
        const result = await pgClient.query(
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

apiRouter.delete('/action-items/:itemId', async (req, res) => {
    const { itemId } = req.params;
    try {
        const result = await pgClient.query('DELETE FROM action_items WHERE action_item_id = $1', [itemId]);
        if (result.rowCount === 0) return res.status(404).send('Action item not found.');
        res.status(204).send(); // No Content
    } catch (error) {
        console.error(`Error deleting action item ${itemId}:`, error);
        res.status(500).send('Internal Server Error');
    }
});


// --- Account Detail Endpoints (unchanged) ---
apiRouter.get('/accounts/:accountId/support-tickets', async (req, res) => { /* ... */ });
apiRouter.get('/accounts/:accountId/usage-history', async (req, res) => { /* ... */ });
apiRouter.get('/accounts/:accountId/project-history', async (req, res) => { /* ... */ });


// --- SERVER START ---
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
        // @ts-ignore
        process.exit(1);
    }
})();