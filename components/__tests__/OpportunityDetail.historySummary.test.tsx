import React from 'react';
import { render, screen } from '@testing-library/react';
import OpportunityDetail from '../../components/OpportunityDetail';
import type { Opportunity, AccountDetails, User, ActionItem } from '../../types';

const user: User = { user_id: 'u1', name: 'Tester', email: 't@example.com' };

const showToastSpy = vi.fn();

vi.mock('../../components/Toast', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useToast: () => ({ showToast: showToastSpy }),
}));

beforeEach(() => {
  showToastSpy.mockClear();
  window.scrollTo = vi.fn();
});

const opp = (overrides: Partial<Opportunity>): Opportunity => ({
  opportunities_id: 'id-' + Math.random(),
  opportunities_name: 'Opp',
  opportunities_subscription_start_date: '2024-01-01',
  opportunities_stage_name: 'Closed Won',
  opportunities_owner_name: 'Owner',
  opportunities_renewal_date_on_creation_date: '2024-01-01',
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
  accounts_subscription_end_date: '2025-12-31',
  opportunities_close_date: '2025-06-01',
  opportunities_incremental_bookings: 0,
  opportunities_amount: 10000,
  opportunities_forecast_category: 'Pipeline',
  opportunities_services_forecast_sfdc: 0,
  disposition: { status: 'Not Reviewed', notes: '', version: 1, last_updated_by_user_id: user.user_id },
  actionItems: [] as ActionItem[],
  ...overrides,
});

describe('HistorySummaryTiles', () => {
  it('excludes expansions and computes lifetime value and years', () => {
    // Freeze time so year calc is stable
    vi.setSystemTime(new Date('2025-09-18'));
    const historical = [
      opp({ opportunities_close_date: '2025-03-01', opportunities_amount: 5000, opportunities_type: 'New Business' }),
      opp({ opportunities_close_date: '2025-07-01', opportunities_amount: 0, opportunities_type: 'Expansion' }), // excluded
      opp({ opportunities_close_date: '2025-08-01', opportunities_amount: 7000, opportunities_type: 'Upsell' }),
    ];
    const details: AccountDetails = { supportTickets: [], usageHistory: [], projectHistory: [] };

    render(
      <OpportunityDetail
        opportunity={historical[0]}
        details={details}
        historicalOpportunities={historical}
        onBack={() => {}}
        onSave={() => {}}
        users={[user]}
        currentUser={user}
        onActionItemCreate={() => {}}
        onActionItemUpdate={() => {}}
        onActionItemDelete={() => {}}
      />
    );

    // Tiles exist
    expect(screen.getByText(/Total Years as Customer/i)).toBeInTheDocument();
    expect(screen.getByText(/Lifetime Value/i)).toBeInTheDocument();
  });
});

