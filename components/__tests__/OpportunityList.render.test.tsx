import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../../App';
import { ToastProvider } from '../../components/Toast';

// Vitest hoists vi.mock to the top; define hoisted data for mocks
const { sampleOpp } = vi.hoisted(() => ({ sampleOpp: {
  opportunities_id: 'o1',
  opportunities_name: 'Big Deal',
  opportunities_subscription_start_date: new Date().toISOString(),
  opportunities_stage_name: 'Evaluation',
  opportunities_owner_name: 'Owner 1',
  opportunities_renewal_date_on_creation_date: new Date().toISOString(),
  opportunities_automated_renewal_status: 'N/A',
  accounts_dollars_months_left: 4,
  opportunities_has_services_flag: 'Yes',
  opportunities_amount_services: 10000,
  accounts_outreach_account_link: '',
  accounts_salesforce_account_name: 'Acme Co',
  accounts_primary_fivetran_account_status: 'Active',
  opportunities_quoted_products: '',
  opportunities_product_being_pitched: 'Services',
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
  opportunities_amount: 100000,
  opportunities_forecast_category: 'Pipeline',
  opportunities_services_forecast_sfdc: 0,
  disposition: { status: 'Not Reviewed', notes: '', version: 1, last_updated_by_user_id: 'u1', documents: [] },
  actionItems: [],
} }));

vi.mock('../../services/apiService', () => {
  return {
    fetchUsers: vi.fn().mockResolvedValue([{ user_id: 'u1', name: 'Alice', email: 'a@x.com' }]),
    fetchOpportunities: vi.fn().mockResolvedValue([sampleOpp]),
    fetchOpportunityDetails: vi.fn(),
    saveDisposition: vi.fn(),
    createActionItem: vi.fn(),
    updateActionItem: vi.fn(),
    deleteActionItem: vi.fn(),
  };
});

describe('OpportunityList render', () => {
  it('renders at least one opportunity row', async () => {
    render(
      <ToastProvider>
        <App />
      </ToastProvider>
    );
    await waitFor(() => expect(screen.getByText('Acme Co')).toBeInTheDocument());
    expect(screen.getByText('Big Deal')).toBeInTheDocument();
  });
});
