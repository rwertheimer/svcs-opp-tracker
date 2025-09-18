import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import OpportunityDetail from '../../components/OpportunityDetail';
import type { Opportunity, AccountDetails, User, ActionItem } from '../../types';

const user: User = { user_id: 'u1', name: 'Alice', email: 'a@x.com' };

const baseOpp: Opportunity = {
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
  disposition: { status: 'Not Reviewed', notes: '', version: 1, last_updated_by_user_id: user.user_id },
  actionItems: [] as ActionItem[],
};

const details: AccountDetails = { supportTickets: [], usageHistory: [], projectHistory: [] };

describe('OpportunityDetail staging defaults', () => {
  it('stages default tasks when Services Fit is selected', () => {
    render(
      <OpportunityDetail
        opportunity={baseOpp}
        details={details}
        historicalOpportunities={[baseOpp]}
        onBack={() => {}}
        onSave={() => {}}
        users={[user]}
        currentUser={user}
        onActionItemCreate={() => {}}
        onActionItemUpdate={() => {}}
        onActionItemDelete={() => {}}
      />
    );

    // Click Services Fit button
    const servicesFitBtn = screen.getByRole('button', { name: /services fit/i });
    fireEvent.click(servicesFitBtn);

    // Expect staged defaults to appear (collapsed rows with Pending save label)
    // Use one of the canonical defaults
    expect(screen.getAllByText(/Pending save/i).length).toBeGreaterThan(0);
    // The staged task title input may be collapsed; ensure the text exists in the DOM
    expect(screen.getAllByText(/Contact Opp Owner/i).length).toBeGreaterThan(0);
  });
});
