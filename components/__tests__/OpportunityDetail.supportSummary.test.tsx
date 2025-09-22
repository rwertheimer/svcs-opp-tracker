import React from 'react';
import { render, screen } from '@testing-library/react';
import OpportunityDetail from '../../components/OpportunityDetail';
import type { Opportunity, AccountDetails, User, ActionItem, SupportTicket } from '../../types';

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

const baseOpp = (overrides: Partial<Opportunity> = {}): Opportunity => ({
  opportunities_id: 'opp1',
  opportunities_name: 'Test Opp',
  opportunities_subscription_start_date: '2025-01-01',
  opportunities_stage_name: 'Prospecting',
  opportunities_owner_name: 'Owner',
  opportunities_renewal_date_on_creation_date: '2025-01-01',
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
  opportunities_close_date: '2025-12-31',
  opportunities_incremental_bookings: 0,
  opportunities_amount: 0,
  opportunities_forecast_category: 'Pipeline',
  opportunities_services_forecast_sfdc: 0,
  disposition: { status: 'Not Reviewed', notes: '', version: 1, last_updated_by_user_id: user.user_id },
  actionItems: [] as ActionItem[],
  ...overrides,
});

const ticket = (overrides: Partial<SupportTicket>): SupportTicket => ({
  accounts_salesforce_account_id: 'acc1',
  accounts_outreach_account_link: '',
  accounts_salesforce_account_name: 'Acme',
  accounts_owner_name: 'Owner',
  tickets_ticket_url: '#',
  tickets_ticket_number: Math.floor(Math.random()*10000),
  tickets_created_date: '2025-07-01',
  tickets_status: 'Open',
  tickets_subject: 'Issue',
  days_open: 5,
  tickets_last_response_from_support_at_date: '2025-07-02',
  tickets_is_escalated: 'No',
  days_since_last_response: 3,
  tickets_priority: 'High',
  tickets_new_csat_numeric: null,
  tickets_engineering_issue_links_c: null,
  ...overrides,
});

describe('SupportSummaryTiles', () => {
  it('counts last 6 months correctly and shows priority breakdown', () => {
    const details: AccountDetails = {
      supportTickets: [
        ticket({ tickets_created_date: '2025-07-10', tickets_priority: 'Urgent', tickets_is_escalated: 'Yes' }),
        ticket({ tickets_created_date: '2025-06-01', tickets_priority: 'High' }),
        ticket({ tickets_created_date: '2025-01-01', tickets_priority: 'Low' }), // outside 6 months (depending on now)
      ],
      usageHistory: [],
      projectHistory: [],
    };
    render(
      <OpportunityDetail
        opportunity={baseOpp()}
        details={details}
        historicalOpportunities={[baseOpp()]}
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
    expect(screen.getByText(/Open Tickets/i)).toBeInTheDocument();
    expect(screen.getByText(/Last 6 Months/i)).toBeInTheDocument();
    expect(screen.getByText(/Escalated \(Last 6m\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Priority \(Last 6m\)/i)).toBeInTheDocument();
  });
});

