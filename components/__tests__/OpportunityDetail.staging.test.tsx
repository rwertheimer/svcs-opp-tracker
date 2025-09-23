import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OpportunityDetail from '../../components/OpportunityDetail';
import type { Opportunity, AccountDetails, User, ActionItem } from '../../types';

const user: User = { user_id: 'u1', name: 'Alice', email: 'a@x.com' };

const showToastSpy = vi.fn();

vi.mock('../../components/Toast', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useToast: () => ({ showToast: showToastSpy }),
}));

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
  beforeEach(() => {
    showToastSpy.mockClear();
    window.scrollTo = vi.fn();
  });

  const renderDetail = (overrides: Partial<React.ComponentProps<typeof OpportunityDetail>> = {}) =>
    render(
      <OpportunityDetail
        opportunity={baseOpp}
        details={details}
        historicalOpportunities={[baseOpp]}
        onBack={() => {}}
        onSaveActionPlan={vi.fn().mockResolvedValue({ disposition: baseOpp.disposition, actionItems: [] })}
        users={[user]}
        currentUser={user}
        {...overrides}
      />
    );

  it('stages default tasks when Services Fit is selected', () => {
    renderDetail();

    // Click Services Fit button
    const servicesFitBtn = screen.getByRole('button', { name: /services fit/i });
    fireEvent.click(servicesFitBtn);

    // Expect staged defaults to appear with unsaved indicator
    expect(screen.getAllByText(/unsaved task/i).length).toBeGreaterThan(0);
    // The staged task title appears as an editable input
    expect(screen.getAllByDisplayValue(/Contact Opp Owner/i).length).toBeGreaterThan(0);
  });

  it('persists staged defaults via the save CTA and shows a success toast', async () => {
    const saveSpy = vi.fn().mockImplementation(async payload => ({
      disposition: { ...baseOpp.disposition, status: payload.disposition.status, version: baseOpp.disposition.version + 1 },
      actionItems: payload.actionItems.map((item, index) => ({
        action_item_id: item.action_item_id ?? `ai-${index}`,
        opportunity_id: baseOpp.opportunities_id,
        name: item.name,
        status: item.status,
        due_date: item.due_date ?? '',
        documents: item.documents ?? [],
        created_by_user_id: user.user_id,
        assigned_to_user_id: item.assigned_to_user_id,
      })),
    }));

    renderDetail({ onSaveActionPlan: saveSpy });

    fireEvent.click(screen.getByRole('button', { name: /services fit/i }));

    const saveButton = await screen.findByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });
    expect(showToastSpy).toHaveBeenCalledWith('Action plan saved', 'success');
    await waitFor(() => {
      expect(screen.queryByText(/unsaved task/i)).not.toBeInTheDocument();
    });
  });

  it('prompts before navigating back with staged defaults', () => {
    const onBack = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderDetail({ onBack });

    fireEvent.click(screen.getByRole('button', { name: /services fit/i }));

    fireEvent.click(screen.getByRole('button', { name: /back to list/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getAllByText(/unsaved task/i).length).toBeGreaterThan(0);
    confirmSpy.mockRestore();
  });

  it('prompts before changing disposition away from Services Fit when staged defaults exist', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderDetail();

    fireEvent.click(screen.getByRole('button', { name: /services fit/i }));

    fireEvent.click(screen.getByRole('button', { name: /no action needed/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getAllByText(/unsaved task/i).length).toBeGreaterThan(0);
    confirmSpy.mockRestore();
  });

  it('prompts before switching tabs away from disposition when staged defaults exist', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderDetail();

    fireEvent.click(screen.getByRole('button', { name: /services fit/i }));

    fireEvent.click(screen.getByRole('button', { name: /support/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getAllByText(/unsaved task/i).length).toBeGreaterThan(0);
    confirmSpy.mockRestore();
  });
  it('shows save bar for disposition edits and hides after commit', async () => {
    const saveSpy = vi.fn().mockResolvedValue({ disposition: { ...baseOpp.disposition, notes: 'updated', version: 2 }, actionItems: [] });

    renderDetail({ onSaveActionPlan: saveSpy });

    const notes = screen.getByLabelText(/general notes/i);
    fireEvent.change(notes, { target: { value: 'Updated notes' } });

    expect(await screen.findByText(/unsaved disposition changes/i)).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    });
  });

  it('discard button clears staged defaults and restores original state', async () => {
    renderDetail();

    fireEvent.click(screen.getByRole('button', { name: /services fit/i }));

    expect(await screen.findByText(/unsaved disposition and action plan changes/i)).toBeInTheDocument();
    expect(screen.getAllByText(/unsaved task/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /discard changes/i }));

    await waitFor(() => {
      expect(screen.queryByText(/unsaved task/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/unsaved/i)).not.toBeInTheDocument();
  });
});
