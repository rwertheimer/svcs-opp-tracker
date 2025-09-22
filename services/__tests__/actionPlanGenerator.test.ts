import { describe, expect, it } from 'vitest';
import { generateDefaultPlan, normalizeActionItemDueDate } from '../actionPlanGenerator';
import { ActionItemStatus, type Opportunity } from '../../types';

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
        opportunities_has_services_flag: 'No',
        opportunities_amount_services: null,
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
            notes: '',
            version: 1,
            last_updated_by_user_id: 'user-1',
        },
        actionItems: [],
    };

    return {
        ...base,
        ...overrides,
        disposition: { ...base.disposition, ...overrides.disposition },
        actionItems: overrides.actionItems ?? base.actionItems,
    };
};

describe('generateDefaultPlan', () => {
    it('creates default tasks with due dates offset from the start date', () => {
        const opportunity = makeOpportunity();
        const plan = generateDefaultPlan(opportunity, '2024-06-01');

        expect(plan).toHaveLength(5);
        expect(plan.map(item => item.name)).toEqual([
            'Contact Opp Owner',
            'Scope and develop proposal',
            'Share proposal',
            'Finalize proposal',
            'Ironclad approval',
        ]);
        expect(plan.map(item => item.due_date)).toEqual([
            '2024-06-01',
            '2024-06-08',
            '2024-06-15',
            '2024-06-22',
            '2024-06-29',
        ]);
    });

    it('preserves existing due dates when available on the opportunity', () => {
        const opportunity = makeOpportunity({
            actionItems: [
                {
                    action_item_id: 'ai-1',
                    opportunity_id: 'opp-1',
                    name: 'Share proposal',
                    status: ActionItemStatus.InProgress,
                    due_date: '2024-07-04T00:00:00.000Z',
                    notes: 'Custom timeline',
                    documents: [],
                    created_by_user_id: 'user-1',
                    assigned_to_user_id: 'user-1',
                },
            ],
        });

        const plan = generateDefaultPlan(opportunity, '2024-06-01');
        const shareTask = plan.find(item => item.name === 'Share proposal');

        expect(shareTask?.due_date).toBe('2024-07-04');
    });

    it('leaves due dates blank when the start date is missing or invalid', () => {
        const opportunity = makeOpportunity();

        expect(generateDefaultPlan(opportunity, '').every(item => item.due_date === '')).toBe(true);
        expect(generateDefaultPlan(opportunity, 'not-a-date').every(item => item.due_date === '')).toBe(true);
        expect(generateDefaultPlan(opportunity, null).every(item => item.due_date === '')).toBe(true);
    });
});

describe('normalizeActionItemDueDate', () => {
    it('normalizes ISO strings with time portions', () => {
        expect(normalizeActionItemDueDate('2024-05-24T00:00:00.000Z')).toBe('2024-05-24');
    });

    it('returns an empty string for invalid inputs', () => {
        expect(normalizeActionItemDueDate('')).toBe('');
        expect(normalizeActionItemDueDate('not-a-date')).toBe('');
        expect(normalizeActionItemDueDate('   ')).toBe('');
    });

    it('formats parseable non-ISO strings to YYYY-MM-DD', () => {
        expect(normalizeActionItemDueDate('May 24, 2024')).toBe('2024-05-24');
    });
});
