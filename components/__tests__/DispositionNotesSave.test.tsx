import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DispositionActionPlanProvider, useDispositionActionPlan } from '../disposition/DispositionActionPlanContext';
import SaveBar from '../disposition/SaveBar';
import DispositionForm from '../DispositionForm';
import type { Opportunity, User } from '../../types';

declare module '../Toast' {
    export const ToastProvider: React.FC<{ children: React.ReactNode }>;
    export const useToast: () => { showToast: (message: string, tone: 'success' | 'error') => void };
}

vi.mock('../Toast', () => ({
    ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useToast: () => ({ showToast: vi.fn() }),
}));

const user: User = { user_id: 'user-1', name: 'Test User', email: 'user@example.com' };

const opportunity: Opportunity = {
    opportunities_id: 'opp-1',
    opportunities_name: 'Test Opp',
    opportunities_subscription_start_date: '2024-01-01',
    opportunities_stage_name: 'Prospecting',
    opportunities_owner_name: 'Owner',
    opportunities_renewal_date_on_creation_date: '2024-12-01',
    opportunities_automated_renewal_status: 'Auto',
    accounts_dollars_months_left: 0,
    opportunities_has_services_flag: 'No',
    opportunities_amount_services: 0,
    accounts_outreach_account_link: '',
    accounts_salesforce_account_name: 'Acme',
    accounts_primary_fivetran_account_status: 'Active',
    opportunities_quoted_products: '',
    opportunities_product_being_pitched: '',
    accounts_se_territory_owner_email: '',
    opportunities_connectors: '',
    opportunities_connector_tshirt_size_list: '',
    opportunities_destinations: '',
    opportunities_type: 'New',
    accounts_region_name: 'NA',
    accounts_salesforce_account_id: 'acc-1',
    opportunities_manager_of_opp_email: '',
    accounts_subscription_end_date: '2024-12-31',
    opportunities_close_date: '2024-06-30',
    opportunities_incremental_bookings: 0,
    opportunities_amount: 0,
    opportunities_forecast_category: 'Pipeline',
    opportunities_services_forecast_sfdc: 0,
    disposition: {
        status: 'Watchlist',
        notes: 'Initial baseline notes',
        version: 1,
        last_updated_by_user_id: user.user_id,
    },
    actionItems: [],
};

const Harness: React.FC = () => {
    const { opportunity, draftDisposition, changeDispositionStatus, updateDisposition } = useDispositionActionPlan();
    return (
        <>
            <SaveBar />
            <DispositionForm
                opportunity={opportunity}
                disposition={draftDisposition}
                onStatusChange={changeDispositionStatus}
                onDispositionChange={updateDisposition}
            />
        </>
    );
};

describe('Disposition general notes persistence', () => {
    it('sends edited notes when saving through the provider UI', async () => {
        const onSave = vi.fn().mockResolvedValue({
            disposition: {
                status: 'Watchlist',
                notes: 'Updated general notes text',
                version: 2,
                last_updated_by_user_id: user.user_id,
            },
            actionItems: [],
        });

        render(
            <DispositionActionPlanProvider opportunity={opportunity} currentUser={user} onSaveActionPlan={onSave}>
                <Harness />
            </DispositionActionPlanProvider>
        );

        const textarea = await screen.findByLabelText('General Notes');
        fireEvent.change(textarea, { target: { value: 'Updated general notes text' } });

        const saveButton = await screen.findByRole('button', { name: /save changes/i });
        fireEvent.click(saveButton);

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        expect(onSave.mock.calls[0][0].disposition.notes).toBe('Updated general notes text');
    });
});
