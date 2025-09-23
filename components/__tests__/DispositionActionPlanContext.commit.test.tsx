import React, { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import {
    DispositionActionPlanProvider,
    useDispositionActionPlan,
} from '../../components/disposition/DispositionActionPlanContext';
import type { Opportunity, User, ActionItem, Document } from '../../types';
import { ActionItemStatus } from '../../types';

const showToastSpy = vi.fn();

vi.mock('../../components/Toast', () => ({
    ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useToast: () => ({ showToast: showToastSpy }),
}));

const users: User[] = [
    { user_id: 'u1', name: 'Alice', email: 'alice@example.com' },
    { user_id: 'u2', name: 'Bob', email: 'bob@example.com' },
];

const makeOpportunity = (overrides: Partial<Opportunity> = {}): Opportunity => {
    const base: Opportunity = {
        opportunities_id: 'opp-1',
        opportunities_name: 'Example Opportunity',
        opportunities_subscription_start_date: '2024-01-01',
        opportunities_stage_name: 'Prospecting',
        opportunities_owner_name: 'Owner Name',
        opportunities_renewal_date_on_creation_date: '2024-12-31',
        opportunities_automated_renewal_status: 'Auto',
        accounts_dollars_months_left: 12,
        opportunities_has_services_flag: 'Yes',
        opportunities_amount_services: 1000,
        accounts_outreach_account_link: 'https://example.com',
        accounts_salesforce_account_name: 'Example Account',
        accounts_primary_fivetran_account_status: 'Active',
        opportunities_quoted_products: 'Product A',
        opportunities_product_being_pitched: 'Product A',
        accounts_se_territory_owner_email: 'owner@example.com',
        opportunities_connectors: 'Connector',
        opportunities_connector_tshirt_size_list: 'M',
        opportunities_destinations: 'Destination',
        opportunities_type: 'New Business',
        accounts_region_name: 'NA',
        accounts_salesforce_account_id: 'acct-1',
        opportunities_manager_of_opp_email: 'manager@example.com',
        accounts_subscription_end_date: '2025-01-01',
        opportunities_close_date: '2024-07-01',
        opportunities_incremental_bookings: 0,
        opportunities_amount: 1000,
        opportunities_forecast_category: 'Commit',
        opportunities_services_forecast_sfdc: 0,
        disposition: {
            status: 'Not Reviewed',
            notes: 'Baseline notes',
            version: 1,
            last_updated_by_user_id: users[0].user_id,
        },
        actionItems: [
            {
                action_item_id: 'ai-1',
                opportunity_id: 'opp-1',
                name: 'Initial Task',
                status: ActionItemStatus.NotStarted,
                due_date: '2024-06-15',
                documents: [],
                created_by_user_id: users[0].user_id,
                assigned_to_user_id: users[0].user_id,
            },
        ],
    };

    return {
        ...base,
        ...overrides,
        disposition: { ...base.disposition, ...overrides.disposition },
        actionItems: overrides.actionItems ?? base.actionItems,
    };
};

type ContextValue = ReturnType<typeof useDispositionActionPlan>;

describe('DispositionActionPlanProvider commitDraft', () => {
    beforeEach(() => {
        showToastSpy.mockReset();
    });

    const renderProvider = (
        overrides: Partial<React.ComponentProps<typeof DispositionActionPlanProvider>> = {}
    ) => {
        const captured: { current: ContextValue | null } = { current: null };

        const Capture: React.FC = () => {
            const context = useDispositionActionPlan();
            useEffect(() => {
                captured.current = context;
            }, [context]);
            return null;
        };

        const opportunity = overrides.opportunity ?? makeOpportunity();
        const onSaveActionPlan = overrides.onSaveActionPlan ?? vi.fn();

        render(
            <DispositionActionPlanProvider
                opportunity={opportunity}
                currentUser={users[0]}
                onSaveActionPlan={onSaveActionPlan}
            >
                <Capture />
            </DispositionActionPlanProvider>
        );

        return {
            getContext: () => {
                if (!captured.current) {
                    throw new Error('Context not ready');
                }
                return captured.current;
            },
        };
    };

    it('saves disposition edits, task field updates, and staged documents', async () => {
        const updatedDocuments: Document[] = [
            { id: 'doc-1', text: 'Updated Spec', url: 'https://example.com/spec' },
        ];
        const stagedDocuments: Document[] = [
            { id: 'doc-2', text: 'Kickoff Deck', url: 'https://example.com/deck' },
        ];

        const saveResponse = {
            disposition: {
                status: 'Services Fit',
                notes: 'Committed notes',
                reason: 'Because',
                services_amount_override: 2500,
                forecast_category_override: 'Best Case',
                version: 2,
                last_updated_by_user_id: users[0].user_id,
            },
            actionItems: [
                {
                    action_item_id: 'ai-1',
                    opportunity_id: 'opp-1',
                    name: 'Initial Task Updated',
                    status: ActionItemStatus.InProgress,
                    due_date: '2024-06-20',
                    documents: updatedDocuments,
                    created_by_user_id: users[0].user_id,
                    assigned_to_user_id: users[1].user_id,
                },
                {
                    action_item_id: 'ai-new',
                    opportunity_id: 'opp-1',
                    name: 'Kickoff Call',
                    status: ActionItemStatus.NotStarted,
                    due_date: '',
                    documents: stagedDocuments,
                    created_by_user_id: users[0].user_id,
                    assigned_to_user_id: users[0].user_id,
                },
            ] as ActionItem[],
        };

        const onSave = vi.fn().mockResolvedValue(saveResponse);
        const { getContext } = renderProvider({
            onSaveActionPlan: onSave,
        });

        await waitFor(() => {
            expect(getContext()).toBeTruthy();
        });

        await act(async () => {
            const ctx = getContext();
            ctx.updateDisposition({
                status: 'Services Fit',
                notes: 'Committed notes',
                reason: 'Because',
                services_amount_override: 2500,
                forecast_category_override: 'Best Case',
            });
            ctx.updateActionItem('ai-1', {
                name: 'Initial Task Updated',
                status: ActionItemStatus.InProgress,
                due_date: '2024-06-20',
                documents: updatedDocuments,
                assigned_to_user_id: users[1].user_id,
            });
            ctx.addStagedActionItem({
                name: 'Kickoff Call',
                documents: stagedDocuments,
            });
        });

        await act(async () => {
            await getContext().commitDraft();
        });

        expect(onSave).toHaveBeenCalledTimes(1);
        const payload = onSave.mock.calls[0][0];
        expect(payload.disposition).toMatchObject({
            status: 'Services Fit',
            reason: 'Because',
            services_amount_override: 2500,
            forecast_category_override: 'Best Case',
            version: 1,
            notes: 'Committed notes',
        });
        expect(payload.actionItems).toEqual([
            expect.objectContaining({
                action_item_id: 'ai-1',
                name: 'Initial Task Updated',
                status: ActionItemStatus.InProgress,
                due_date: '2024-06-20',
                documents: updatedDocuments,
                assigned_to_user_id: users[1].user_id,
            }),
            expect.objectContaining({
                name: 'Kickoff Call',
                status: ActionItemStatus.NotStarted,
                documents: stagedDocuments,
                assigned_to_user_id: users[0].user_id,
            }),
        ]);

        expect(showToastSpy).toHaveBeenCalledWith('Action plan saved', 'success');

        await waitFor(() => {
            const ctx = getContext();
            expect(ctx.hasUnsavedDispositionChanges).toBe(false);
            expect(ctx.hasStagedActionPlanChanges).toBe(false);
            expect(ctx.actionItems).toHaveLength(2);
        });

        const ctxAfterSave = getContext();
        expect(ctxAfterSave.actionItems.find(item => item.action_item_id === 'ai-1')?.documents).toEqual(
            updatedDocuments
        );
        expect(ctxAfterSave.actionItems.find(item => item.action_item_id === 'ai-new')?.documents).toEqual(
            stagedDocuments
        );
    });

    it('restores staged state when save fails and surfaces the error toast', async () => {
        const error = Object.assign(new Error('boom'), { status: 500 });
        const onSave = vi.fn().mockRejectedValue(error);
        const { getContext } = renderProvider({ onSaveActionPlan: onSave });

        await waitFor(() => {
            expect(getContext()).toBeTruthy();
        });

        await act(async () => {
            const ctx = getContext();
            ctx.updateDisposition({ notes: 'New notes' });
            ctx.addStagedActionItem({ name: 'Follow Up' });
        });

        await act(async () => {
            await expect(getContext().commitDraft()).rejects.toBe(error);
        });

        expect(showToastSpy).toHaveBeenCalledWith('Failed to save changes', 'error');
        const ctx = getContext();
        expect(ctx.hasUnsavedDispositionChanges).toBe(true);
        expect(ctx.stagedActionItems).toHaveLength(1);
    });

    it('handles optimistic lock conflicts and allows retry after the queue resets', async () => {
        const conflict = Object.assign(new Error('Conflict'), { status: 409 });
        const successResponse = {
            disposition: {
                status: 'Services Fit',
                notes: 'Updated',
                version: 2,
                last_updated_by_user_id: users[0].user_id,
            },
            actionItems: [],
        } as const;

        const onSave = vi
            .fn()
            .mockRejectedValueOnce(conflict)
            .mockResolvedValueOnce(successResponse);

        const { getContext } = renderProvider({ onSaveActionPlan: onSave });

        await waitFor(() => {
            expect(getContext()).toBeTruthy();
        });

        await act(async () => {
            const ctx = getContext();
            ctx.updateDisposition({ status: 'Services Fit' });
        });

        await act(async () => {
            await expect(getContext().commitDraft()).rejects.toBe(conflict);
        });

        expect(showToastSpy).toHaveBeenCalledWith(
            'Save conflict: another user updated this opportunity. Refresh to continue.',
            'error'
        );
        expect(getContext().isCommittingDraft).toBe(false);

        await act(async () => {
            await getContext().commitDraft();
        });

        expect(onSave).toHaveBeenCalledTimes(2);
        expect(showToastSpy).toHaveBeenLastCalledWith('Action plan saved', 'success');
        expect(getContext().draftDisposition.version).toBe(2);
    });
});
