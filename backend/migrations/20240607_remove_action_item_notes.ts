import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import * as dotenv from 'dotenv';
import logger from '../logger';

dotenv.config();

const pool = new Pool({
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT || '5432', 10),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
    ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false },
});

interface LegacyNoteRow {
    action_item_id: string;
    opportunity_id: string;
    notes: string | null;
}

async function archiveLegacyNotes(client: PoolClient, rows: LegacyNoteRow[]) {
    if (rows.length === 0) {
        logger.info('No legacy action item notes found; skipping archival');
        return;
    }

    logger.info({ noteCount: rows.length }, 'Archiving legacy action item notes to archive table');
    await client.query(`
        CREATE TABLE IF NOT EXISTS action_item_notes_archive (
            archive_id SERIAL PRIMARY KEY,
            action_item_id UUID NOT NULL,
            opportunity_id VARCHAR(255) NOT NULL,
            note TEXT,
            archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    for (const row of rows) {
        await client.query(
            'INSERT INTO action_item_notes_archive (action_item_id, opportunity_id, note) VALUES ($1, $2, $3)',
            [row.action_item_id, row.opportunity_id, row.notes]
        );
        logger.info({ actionItemId: row.action_item_id }, 'Archived legacy action item note');
    }
}

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const columnCheck = await client.query(
            `SELECT 1 FROM information_schema.columns WHERE table_name = 'action_items' AND column_name = 'notes'`
        );

        if (columnCheck.rowCount && columnCheck.rowCount > 0) {
            const { rows } = await client.query<LegacyNoteRow>(
                `SELECT action_item_id, opportunity_id, notes FROM action_items WHERE notes IS NOT NULL AND notes <> ''`
            );

            await archiveLegacyNotes(client, rows);

            logger.info('Dropping notes column from action_items');
            await client.query('ALTER TABLE action_items DROP COLUMN IF EXISTS notes');
        } else {
            logger.info('Notes column missing on action_items; skipping drop');
        }

        logger.info('Removing notes key from action_item documents JSON');
        await client.query(
            `UPDATE action_items
             SET documents = jsonb_strip_nulls(documents - 'notes')
             WHERE documents IS NOT NULL AND documents ? 'notes'`
        );

        await client.query('COMMIT');
        logger.info('Migration completed successfully');
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error({ err: error }, 'Migration failed');
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(error => {
    logger.error({ err: error }, 'Migration encountered an unexpected error');
    process.exitCode = 1;
});
