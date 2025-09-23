import type { Router, Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import type { ActionItem, Disposition, Document } from '../types';

export type LegacyActionItemRow = ActionItem & { notes?: unknown };

export const stripActionItemNotes = (item: LegacyActionItemRow): ActionItem => {
    const { notes: _legacyNotes, ...rest } = item;
    return {
        ...rest,
        due_date: rest.due_date ?? '',
        documents: Array.isArray(rest.documents) ? rest.documents : [],
    };
};

export const sanitizeActionItemCollection = (items: unknown): ActionItem[] => {
    if (!Array.isArray(items)) {
        return [];
    }

    return items.map(item => stripActionItemNotes(item as LegacyActionItemRow));
};

export type ActionPlanDispositionInput = Pick<
    Disposition,
    'status' | 'reason' | 'services_amount_override' | 'forecast_category_override' | 'version'
> & {
    notes?: string;
    last_updated_by_user_id?: never;
    last_updated_at?: never;
};

export interface ActionPlanItemInput {
    action_item_id?: string;
    name: string;
    status: ActionItem['status'];
    due_date?: string | null;
    documents?: Document[];
    assigned_to_user_id: string;
    created_by_user_id?: string;
}

export interface ActionPlanPayload {
    disposition: ActionPlanDispositionInput;
    actionItems: ActionPlanItemInput[];
}

export class ActionPlanValidationError extends Error {}
export class ActionPlanConflictError extends Error {}
export class ActionPlanNotFoundError extends Error {}

const normalizeDocuments = (documents: unknown): Document[] => {
    if (!Array.isArray(documents)) {
        return [];
    }

    return documents as Document[];
};

const normalizeDueDate = (due: string | null | undefined): string | null => {
    if (!due) {
        return null;
    }

    return due;
};

export interface ActionPlanSnapshot {
    disposition: Disposition;
    actionItems: ActionItem[];
}

export const loadOpportunityActionPlan = async (
    client: PoolClient,
    opportunityId: string,
    options: { forUpdate?: boolean } = {}
): Promise<ActionPlanSnapshot | null> => {
    const forUpdateClause = options.forUpdate ? 'FOR UPDATE' : '';
    const { rows } = await client.query(
        `SELECT disposition, (
            SELECT COALESCE(
                jsonb_agg((to_jsonb(ai) - 'notes') ORDER BY ai.due_date ASC NULLS LAST),
                '[]'::jsonb
            )
            FROM action_items ai
            WHERE ai.opportunity_id = $1
        ) as action_items
        FROM opportunities
        WHERE opportunities_id = $1
        ${forUpdateClause}`,
        [opportunityId]
    );

    if (rows.length === 0) {
        return null;
    }

    const disposition = rows[0].disposition as Disposition;
    const actionItems = sanitizeActionItemCollection(rows[0].action_items);

    return { disposition, actionItems };
};

const ensureDispositionPayload = (payload: ActionPlanDispositionInput | undefined): ActionPlanDispositionInput => {
    if (!payload || typeof payload !== 'object') {
        throw new ActionPlanValidationError('Disposition payload is required.');
    }

    if (typeof payload.version !== 'number') {
        throw new ActionPlanValidationError('Disposition version is required.');
    }

    if (payload.notes !== undefined && typeof payload.notes !== 'string') {
        throw new ActionPlanValidationError('Disposition notes must be a string.');
    }

    return payload;
};

const validateActionItemsPayload = (payload: ActionPlanItemInput[] | undefined): ActionPlanItemInput[] => {
    if (!payload) {
        throw new ActionPlanValidationError('Action items payload is required.');
    }

    if (!Array.isArray(payload)) {
        throw new ActionPlanValidationError('Action items must be an array.');
    }

    payload.forEach(item => {
        if (!item || typeof item !== 'object') {
            throw new ActionPlanValidationError('Invalid action item payload.');
        }
        if (!item.name || !item.status || !item.assigned_to_user_id) {
            throw new ActionPlanValidationError('Action items require name, status, and assigned user.');
        }
    });

    return payload;
};

const persistDisposition = async (
    client: PoolClient,
    opportunityId: string,
    current: Disposition,
    updates: ActionPlanDispositionInput,
    userId: string
): Promise<Disposition> => {
    const currentVersion = current.version ?? 0;
    if (currentVersion !== updates.version) {
        throw new ActionPlanConflictError('Conflict: This opportunity has been updated by another user.');
    }

    const updatedDisposition: Disposition = {
        ...current,
        ...updates,
        notes: updates.notes ?? current.notes ?? '',
        version: currentVersion + 1,
        last_updated_by_user_id: userId,
        last_updated_at: new Date().toISOString(),
    };

    await client.query('UPDATE opportunities SET disposition = $1 WHERE opportunities_id = $2', [updatedDisposition, opportunityId]);

    const changeDetails = {
        status: updatedDisposition.status,
        notes: updatedDisposition.notes,
        reason: updatedDisposition.reason ?? null,
        services_amount_override: updatedDisposition.services_amount_override ?? null,
        forecast_category_override: updatedDisposition.forecast_category_override ?? null,
    };

    await client.query(
        'INSERT INTO disposition_history (opportunity_id, updated_by_user_id, change_details) VALUES ($1, $2, $3)',
        [opportunityId, userId, changeDetails]
    );

    return updatedDisposition;
};

const persistActionItems = async (
    client: PoolClient,
    opportunityId: string,
    snapshot: ActionPlanSnapshot,
    payload: ActionPlanItemInput[],
    userId: string
): Promise<void> => {
    const existingById = new Map(snapshot.actionItems.map(item => [item.action_item_id, item]));
    const incomingIds = new Set<string>();

    for (const item of payload) {
        const normalizedDocuments = normalizeDocuments(item.documents);
        const dueDate = normalizeDueDate(item.due_date ?? null);

        if (item.action_item_id) {
            const existing = existingById.get(item.action_item_id);
            if (!existing) {
                throw new ActionPlanValidationError(`Unknown action item: ${item.action_item_id}`);
            }

            incomingIds.add(item.action_item_id);
            await client.query(
                `UPDATE action_items
                 SET name = $1,
                     status = $2,
                     due_date = $3,
                     documents = $4,
                     assigned_to_user_id = $5
                 WHERE action_item_id = $6`,
                [item.name, item.status, dueDate, normalizedDocuments, item.assigned_to_user_id, item.action_item_id]
            );
        } else {
            const createdBy = item.created_by_user_id ?? userId;
            await client.query(
                `INSERT INTO action_items (opportunity_id, name, status, due_date, documents, created_by_user_id, assigned_to_user_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [opportunityId, item.name, item.status, dueDate, normalizedDocuments, createdBy, item.assigned_to_user_id]
            );
        }
    }

    const idsToDelete = snapshot.actionItems
        .filter(existing => !incomingIds.has(existing.action_item_id))
        .map(item => item.action_item_id);

    if (idsToDelete.length > 0) {
        await client.query('DELETE FROM action_items WHERE action_item_id = ANY($1::uuid[])', [idsToDelete]);
    }
};

export const persistOpportunityActionPlan = async (
    client: PoolClient,
    opportunityId: string,
    userId: string,
    payload: Partial<ActionPlanPayload>
): Promise<ActionPlanSnapshot> => {
    const dispositionPayload = ensureDispositionPayload(payload.disposition);
    const actionItemsPayload = validateActionItemsPayload(payload.actionItems);

    const snapshot = await loadOpportunityActionPlan(client, opportunityId, { forUpdate: true });
    if (!snapshot) {
        throw new ActionPlanNotFoundError('Opportunity not found.');
    }

    const updatedDisposition = await persistDisposition(client, opportunityId, snapshot.disposition, dispositionPayload, userId);
    await persistActionItems(client, opportunityId, snapshot, actionItemsPayload, userId);

    const refreshed = await loadOpportunityActionPlan(client, opportunityId);
    if (!refreshed) {
        throw new ActionPlanNotFoundError('Opportunity not found.');
    }

    return { disposition: { ...updatedDisposition, notes: refreshed.disposition.notes }, actionItems: refreshed.actionItems };
};

export const registerOpportunityActionPlanRoutes = (router: Router, pool: Pool) => {
    router.post('/opportunities/:opportunityId/action-plan', async (req: Request, res: Response) => {
        const { opportunityId } = req.params;
        const userId = (req as any).userId as string | undefined;
        if (!userId) {
            return res.status(400).send('User ID header is required.');
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await persistOpportunityActionPlan(client, opportunityId, userId, req.body as Partial<ActionPlanPayload>);
            await client.query('COMMIT');
            res.status(200).json(result);
        } catch (error) {
            await client.query('ROLLBACK');
            if (error instanceof ActionPlanValidationError) {
                res.status(400).send(error.message);
            } else if (error instanceof ActionPlanConflictError) {
                res.status(409).send(error.message);
            } else if (error instanceof ActionPlanNotFoundError) {
                res.status(404).send(error.message);
            } else {
                console.error(`Error saving action plan for opp ${opportunityId}:`, error);
                res.status(500).send('Internal Server Error');
            }
        } finally {
            client.release();
        }
    });
};

