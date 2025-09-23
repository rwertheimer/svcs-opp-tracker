import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { ActionItem, Disposition } from '../../types';
import {
    ActionPlanConflictError,
    ActionPlanValidationError,
    persistOpportunityActionPlan,
} from '../opportunityActionPlan';

interface FakeOpportunityState {
    id: string;
    disposition: Disposition;
}

interface FakeDatabaseState {
    opportunity: FakeOpportunityState;
    actionItems: Map<string, ActionItem>;
    history: any[];
}

class FakeClient {
    constructor(private state: FakeDatabaseState) {}

    async query(sql: string, params: any[] = []): Promise<{ rows: any[]; rowCount?: number }> {
        if (sql.startsWith('SELECT disposition')) {
            const opportunityId = params[0];
            if (this.state.opportunity.id !== opportunityId) {
                return { rows: [] };
            }
            const items = Array.from(this.state.actionItems.values())
                .filter(item => item.opportunity_id === opportunityId)
                .map(item => ({ ...item }));
            return {
                rows: [
                    {
                        disposition: this.state.opportunity.disposition,
                        action_items: items,
                    },
                ],
            };
        }

        if (sql.startsWith('UPDATE opportunities SET disposition')) {
            const [disposition, opportunityId] = params;
            if (this.state.opportunity.id === opportunityId) {
                this.state.opportunity.disposition = { ...disposition };
            }
            return { rows: [] };
        }

        if (sql.startsWith('INSERT INTO disposition_history')) {
            const [, , changeDetails] = params;
            this.state.history.push(changeDetails);
            return { rows: [] };
        }

        if (sql.startsWith('UPDATE action_items')) {
            const [name, status, dueDate, documents, assignedTo, actionItemId] = params;
            const existing = this.state.actionItems.get(actionItemId);
            if (existing) {
                existing.name = name;
                existing.status = status;
                existing.due_date = dueDate ?? '';
                existing.documents = Array.isArray(documents) ? documents : [];
                existing.assigned_to_user_id = assignedTo;
            }
            return { rows: [] };
        }

        if (sql.startsWith('INSERT INTO action_items')) {
            const [opportunityId, name, status, dueDate, documents, createdBy, assignedTo] = params;
            const id = randomUUID();
            const newItem: ActionItem = {
                action_item_id: id,
                opportunity_id: opportunityId,
                name,
                status,
                due_date: dueDate ?? '',
                documents: Array.isArray(documents) ? documents : [],
                created_by_user_id: createdBy,
                assigned_to_user_id: assignedTo,
            };
            this.state.actionItems.set(id, newItem);
            return { rows: [] };
        }

        if (sql.startsWith('DELETE FROM action_items')) {
            const [ids] = params as [string[]];
            ids.forEach(id => this.state.actionItems.delete(id));
            return { rows: [] };
        }

        throw new Error(`Unhandled query: ${sql}`);
    }

    release() {}
}

describe('persistOpportunityActionPlan', () => {
    const oppId = 'opp-123';
    const userId = randomUUID();
    const assigneeId = randomUUID();
    let state: FakeDatabaseState;
    let client: FakeClient;

    beforeEach(() => {
        const disposition: Disposition = {
            status: 'Not Reviewed',
            notes: 'Initial note',
            version: 1,
            last_updated_by_user_id: userId,
        };

        const firstActionId = randomUUID();
        const secondActionId = randomUUID();

        const firstAction: ActionItem = {
            action_item_id: firstActionId,
            opportunity_id: oppId,
            name: 'Existing Task',
            status: 'Not Started',
            due_date: '2024-07-01',
            documents: [],
            created_by_user_id: userId,
            assigned_to_user_id: assigneeId,
        };

        const secondAction: ActionItem = {
            action_item_id: secondActionId,
            opportunity_id: oppId,
            name: 'Removable Task',
            status: 'Completed',
            due_date: '2024-05-01',
            documents: [],
            created_by_user_id: userId,
            assigned_to_user_id: assigneeId,
        };

        state = {
            opportunity: { id: oppId, disposition },
            actionItems: new Map([
                [firstActionId, { ...firstAction }],
                [secondActionId, { ...secondAction }],
            ]),
            history: [],
        };
        client = new FakeClient(state);
    });

    it('saves disposition changes and diffs action items with inserts, updates, and deletes', async () => {
        const existingId = Array.from(state.actionItems.keys())[0];

        const result = await persistOpportunityActionPlan(client as any, oppId, userId, {
            disposition: {
                status: 'Services Fit',
                reason: 'Customer engaged',
                services_amount_override: 12000,
                forecast_category_override: 'Commit',
                version: 1,
            },
            actionItems: [
                {
                    action_item_id: existingId,
                    name: 'Existing Task Updated',
                    status: 'In Progress',
                    due_date: '2024-08-15',
                    documents: [{ id: 'doc-1', text: 'Call notes', url: 'https://example.com/doc-1' }],
                    assigned_to_user_id: assigneeId,
                },
                {
                    name: 'New Kickoff',
                    status: 'Not Started',
                    due_date: null,
                    documents: [{ id: 'doc-2', text: 'Deck', url: 'https://example.com/deck' }],
                    assigned_to_user_id: assigneeId,
                    created_by_user_id: userId,
                },
            ],
        });

        expect(result.disposition.status).toBe('Services Fit');
        expect(result.disposition.version).toBe(2);
        expect(result.disposition.last_updated_by_user_id).toBe(userId);
        expect(result.disposition.notes).toBe('Initial note');
        expect(result.actionItems).toHaveLength(2);

        const updatedItem = result.actionItems.find(item => item.action_item_id === existingId);
        expect(updatedItem?.status).toBe('In Progress');
        expect(updatedItem?.documents).toEqual([
            { id: 'doc-1', text: 'Call notes', url: 'https://example.com/doc-1' },
        ]);

        const newItem = result.actionItems.find(item => item.name === 'New Kickoff');
        expect(newItem).toBeDefined();
        expect(newItem?.documents).toEqual([
            { id: 'doc-2', text: 'Deck', url: 'https://example.com/deck' },
        ]);
        expect(newItem?.created_by_user_id).toBeDefined();

        expect(state.actionItems.size).toBe(2);
        expect(Array.from(state.actionItems.values()).some(item => item.name === 'Removable Task')).toBe(false);
        expect(state.history).toHaveLength(1);
    });

    it('throws a validation error when required fields are missing', async () => {
        await expect(
            persistOpportunityActionPlan(client as any, oppId, userId, {
                // missing action items array triggers validation
                disposition: {
                    status: 'Watchlist',
                    version: 1,
                },
            } as any)
        ).rejects.toBeInstanceOf(ActionPlanValidationError);

        expect(state.opportunity.disposition.version).toBe(1);
        expect(state.actionItems.size).toBe(2);
    });

    it('throws a conflict error when versions do not match', async () => {
        await expect(
            persistOpportunityActionPlan(client as any, oppId, userId, {
                disposition: {
                    status: 'Services Fit',
                    version: 0,
                },
                actionItems: [],
            })
        ).rejects.toBeInstanceOf(ActionPlanConflictError);

        expect(state.opportunity.disposition.version).toBe(1);
        expect(state.history).toHaveLength(0);
    });
});

