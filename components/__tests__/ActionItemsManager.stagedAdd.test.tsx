import React, { useLayoutEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ActionItemsManager from '../../components/ActionItemsManager';
import type { Opportunity, User } from '../../types';
import { DispositionActionPlanProvider, useDispositionActionPlan } from '../../components/disposition/DispositionActionPlanContext';

const users: User[] = [{ user_id: 'u1', name: 'Alice', email: 'a@x.com' }];

const baseOpportunity: Opportunity = {
  opportunities_id: 'opp1',
  opportunities_name: 'Test Opp',
  opportunities_subscription_start_date: new Date().toISOString(),
  opportunities_stage_name: 'Prospecting',
  opportunities_owner_name: 'Owner',
  opportunities_renewal_date_on_creation_date: new Date().toISOString(),
  opportunities_automated_renewal_status: 'N/A',
  accounts_dollars_months_left: 0,
  opportunities_has_services_flag: 'Yes',
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
  opportunities_type: 'New Business',
  accounts_region_name: 'NA - Enterprise',
  accounts_salesforce_account_id: 'acc1',
  opportunities_manager_of_opp_email: '',
  accounts_subscription_end_date: new Date().toISOString(),
  opportunities_close_date: new Date().toISOString(),
  opportunities_incremental_bookings: 0,
  opportunities_amount: 0,
  opportunities_forecast_category: 'Pipeline',
  opportunities_services_forecast_sfdc: 0,
  disposition: { status: 'Not Reviewed', notes: '', version: 1, last_updated_by_user_id: users[0].user_id },
  actionItems: [],
};

const PrimeStaging: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { changeDispositionStatus } = useDispositionActionPlan();
  useLayoutEffect(() => {
    changeDispositionStatus('Services Fit');
  }, [changeDispositionStatus]);
  return <>{children}</>;
};

vi.mock('../../components/Toast', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useToast: () => ({ showToast: vi.fn() }),
}));

describe('ActionItemsManager - staged add', () => {
  it('adds to staged list (pre-save) instead of persisting', async () => {
    const onCreate = vi.fn();

    render(
      <DispositionActionPlanProvider
        opportunity={baseOpportunity}
        currentUser={users[0]}
        onSaveDisposition={vi.fn()}
        onActionItemCreate={onCreate}
        onActionItemUpdate={vi.fn()}
        onActionItemDelete={vi.fn()}
      >
        <PrimeStaging>
          <ActionItemsManager users={users} />
        </PrimeStaging>
      </DispositionActionPlanProvider>
    );

    await screen.findAllByText(/Pending save/i);

    const input = screen.getByPlaceholderText('Add a new task...');
    fireEvent.change(input, { target: { value: 'Follow-up email' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Follow-up email')).toBeInTheDocument();
  });

  it('persists staged defaults when save CTA is clicked', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);

    render(
      <DispositionActionPlanProvider
        opportunity={baseOpportunity}
        currentUser={users[0]}
        onSaveDisposition={vi.fn()}
        onActionItemCreate={onCreate}
        onActionItemUpdate={vi.fn()}
        onActionItemDelete={vi.fn()}
      >
        <PrimeStaging>
          <ActionItemsManager users={users} />
        </PrimeStaging>
      </DispositionActionPlanProvider>
    );

    const saveButton = await screen.findByRole('button', { name: /save action plan/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalled();
    });
  });
});

