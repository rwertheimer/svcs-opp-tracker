import React, { useLayoutEffect } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ActionItemsManager from '../../components/ActionItemsManager';
import SaveBar from '../../components/disposition/SaveBar';
import type { Opportunity, User } from '../../types';
import { ActionItemStatus } from '../../types';
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

const ManagerHarness: React.FC = () => (
  <>
    <SaveBar />
    <ActionItemsManager users={users} />
  </>
);

const showToast = vi.fn();

vi.mock('../../components/Toast', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useToast: () => ({ showToast }),
}));

beforeEach(() => {
  showToast.mockReset();
});

describe('ActionItemsManager - staged add', () => {
  it('adds to staged list (pre-save) instead of persisting', async () => {
    const onSave = vi.fn();

    render(
      <DispositionActionPlanProvider
        opportunity={baseOpportunity}
        currentUser={users[0]}
        onSaveActionPlan={onSave}
      >
        <PrimeStaging>
          <ManagerHarness />
        </PrimeStaging>
      </DispositionActionPlanProvider>
    );

    await screen.findByText(/Unsaved action plan tasks/i);

    const input = screen.getByPlaceholderText('Add a new task');
    fireEvent.change(input, { target: { value: 'Follow-up email' } });
    fireEvent.click(screen.getByRole('button', { name: /add task/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Follow-up email')).toBeInTheDocument();
  });

  it('persists staged defaults when save CTA is clicked', async () => {
    const onSaveActionPlan = vi.fn().mockImplementation(async payload => ({
      disposition: { ...baseOpportunity.disposition, status: payload.disposition.status, version: baseOpportunity.disposition.version + 1 },
      actionItems: payload.actionItems.map((item, index) => ({
        action_item_id: item.action_item_id ?? `ai-${index}`,
        opportunity_id: baseOpportunity.opportunities_id,
        name: item.name,
        status: item.status,
        due_date: item.due_date ?? '',
        documents: item.documents ?? [],
        created_by_user_id: users[0].user_id,
        assigned_to_user_id: item.assigned_to_user_id,
      })),
    }));

    render(
      <DispositionActionPlanProvider
        opportunity={baseOpportunity}
        currentUser={users[0]}
        onSaveActionPlan={onSaveActionPlan}
      >
        <PrimeStaging>
          <ManagerHarness />
        </PrimeStaging>
      </DispositionActionPlanProvider>
    );

    const saveButton = await screen.findByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSaveActionPlan).toHaveBeenCalledTimes(1);
      expect(onSaveActionPlan.mock.calls[0][0].actionItems.length).toBeGreaterThan(0);
    });
  });

  it('renders persisted documents as external links', async () => {
    const opportunityWithDocs: Opportunity = {
      ...baseOpportunity,
      disposition: { ...baseOpportunity.disposition, status: 'Services Fit' },
      actionItems: [
        {
          action_item_id: 'ai-1',
          opportunity_id: baseOpportunity.opportunities_id,
          name: 'Review spec',
          status: ActionItemStatus.NotStarted,
          due_date: '2024-05-01',
          documents: [{ id: 'doc-1', text: 'Spec Sheet', url: 'https://example.com/spec' }],
          created_by_user_id: users[0].user_id,
          assigned_to_user_id: users[0].user_id,
        },
      ],
    };

    render(
      <DispositionActionPlanProvider
        opportunity={opportunityWithDocs}
        currentUser={users[0]}
        onSaveActionPlan={vi.fn()}
      >
        <ActionItemsManager users={users} />
      </DispositionActionPlanProvider>
    );

    const documentLink = await screen.findByRole('link', { name: /spec sheet/i });
    expect(documentLink).toHaveAttribute('href', 'https://example.com/spec');
    expect(documentLink).toHaveAttribute('target', '_blank');
    expect(documentLink).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('renders newly saved documents as links after persisting', async () => {
    const onSaveActionPlan = vi.fn().mockImplementation(async payload => ({
      disposition: {
        ...baseOpportunity.disposition,
        status: payload.disposition.status,
        version: baseOpportunity.disposition.version + 1,
      },
      actionItems: [
        {
          action_item_id: 'ai-returned',
          opportunity_id: baseOpportunity.opportunities_id,
          name: payload.actionItems[0]?.name ?? 'Contact Opp Owner',
          status: payload.actionItems[0]?.status ?? ActionItemStatus.NotStarted,
          due_date: payload.actionItems[0]?.due_date ?? '',
          documents: [
            { id: 'doc-new', text: 'Implementation Plan', url: 'https://example.com/plan' },
          ],
          created_by_user_id: users[0].user_id,
          assigned_to_user_id: payload.actionItems[0]?.assigned_to_user_id ?? users[0].user_id,
        },
      ],
    }));

    render(
      <DispositionActionPlanProvider
        opportunity={baseOpportunity}
        currentUser={users[0]}
        onSaveActionPlan={onSaveActionPlan}
      >
        <PrimeStaging>
          <ManagerHarness />
        </PrimeStaging>
      </DispositionActionPlanProvider>
    );

    const saveButton = await screen.findByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSaveActionPlan).toHaveBeenCalledTimes(1);
    });

    const documentLink = await screen.findByRole('link', { name: /implementation plan/i });
    expect(documentLink).toHaveAttribute('href', 'https://example.com/plan');
    expect(documentLink).toHaveAttribute('target', '_blank');
  });

  it('includes staged document metadata in the save payload', async () => {
    const onSaveActionPlan = vi.fn().mockImplementation(async payload => ({
      disposition: {
        ...baseOpportunity.disposition,
        status: payload.disposition.status,
        version: baseOpportunity.disposition.version + 1,
      },
      actionItems: payload.actionItems.map((item, index) => ({
        action_item_id: item.action_item_id ?? `ai-${index}`,
        opportunity_id: baseOpportunity.opportunities_id,
        name: item.name,
        status: item.status,
        due_date: item.due_date ?? '',
        documents: item.documents ?? [],
        created_by_user_id: users[0].user_id,
        assigned_to_user_id: item.assigned_to_user_id,
      })),
    }));

    render(
      <DispositionActionPlanProvider
        opportunity={baseOpportunity}
        currentUser={users[0]}
        onSaveActionPlan={onSaveActionPlan}
      >
        <PrimeStaging>
          <ManagerHarness />
        </PrimeStaging>
      </DispositionActionPlanProvider>
    );

    const taskInput = screen.getByPlaceholderText('Add a new task');
    fireEvent.change(taskInput, { target: { value: 'Review implementation doc' } });
    fireEvent.click(screen.getByRole('button', { name: /add task/i }));

    const stagedInput = await screen.findByDisplayValue('Review implementation doc');
    const stagedArticle = stagedInput.closest('article');
    expect(stagedArticle).toBeTruthy();

    const scoped = within(stagedArticle as HTMLElement);
    fireEvent.click(scoped.getByRole('button', { name: /add link/i }));

    const linkTextInput = await scoped.findByLabelText('Link text');
    const linkUrlInput = await scoped.findByLabelText('Link URL');
    const saveLinkButton = scoped.getByRole('button', { name: /save link/i });

    expect(saveLinkButton).toBeDisabled();

    fireEvent.change(linkTextInput, { target: { value: 'Spec Outline' } });
    fireEvent.change(linkUrlInput, { target: { value: 'https://example.com/spec' } });

    expect(saveLinkButton).toBeEnabled();

    fireEvent.click(saveLinkButton);

    await waitFor(() => {
      expect(scoped.queryByLabelText('Link text')).not.toBeInTheDocument();
    });

    const previewLinks = scoped.getAllByRole('link', { name: /spec outline/i });
    expect(previewLinks.length).toBeGreaterThan(0);

    fireEvent.click(scoped.getByRole('button', { name: /edit link/i }));

    const reopenedTextInput = await scoped.findByLabelText('Link text');
    expect(reopenedTextInput).toHaveValue('Spec Outline');

    fireEvent.click(scoped.getByRole('button', { name: /save link/i }));
      
    const saveButton = await screen.findByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSaveActionPlan).toHaveBeenCalledTimes(1);
    });

    const payload = onSaveActionPlan.mock.calls[0][0];
    const savedTask = payload.actionItems.find((item: any) => item.name === 'Review implementation doc');
    expect(savedTask).toBeDefined();
    expect(savedTask.documents).toHaveLength(1);
    expect(savedTask.documents[0]).toMatchObject({
      text: 'Spec Outline',
      url: 'https://example.com/spec',
    });
    expect(savedTask.documents[0].id).toBeTruthy();
  });

  it('keeps staged link inputs visible until the user saves the link', async () => {
    render(
      <DispositionActionPlanProvider
        opportunity={baseOpportunity}
        currentUser={users[0]}
        onSaveActionPlan={vi.fn()}
      >
        <PrimeStaging>
          <ManagerHarness />
        </PrimeStaging>
      </DispositionActionPlanProvider>
    );

    const taskInput = screen.getByPlaceholderText('Add a new task');
    fireEvent.change(taskInput, { target: { value: 'Draft success plan' } });
    fireEvent.click(screen.getByRole('button', { name: /add task/i }));

    const stagedInput = await screen.findByDisplayValue('Draft success plan');
    const stagedArticle = stagedInput.closest('article');
    expect(stagedArticle).toBeTruthy();

    const scoped = within(stagedArticle as HTMLElement);
    fireEvent.click(scoped.getByRole('button', { name: /add link/i }));

    const linkTextInput = await scoped.findByLabelText('Link text');
    const linkUrlInput = await scoped.findByLabelText('Link URL');

    fireEvent.change(linkTextInput, { target: { value: 'CSM Plan' } });
    fireEvent.change(linkUrlInput, { target: { value: 'https://example.com/csm-plan' } });

    await waitFor(() => {
      expect(scoped.getByRole('button', { name: /save link/i })).toBeEnabled();
      expect(scoped.getByLabelText('Link text')).toBeInTheDocument();
      expect(scoped.getByLabelText('Link URL')).toBeInTheDocument();
    });
  });

  it('prevents saving staged links with invalid urls', async () => {
    const onSaveActionPlan = vi.fn();

    render(
      <DispositionActionPlanProvider
        opportunity={baseOpportunity}
        currentUser={users[0]}
        onSaveActionPlan={onSaveActionPlan}
      >
        <PrimeStaging>
          <ManagerHarness />
        </PrimeStaging>
      </DispositionActionPlanProvider>
    );

    const taskInput = screen.getByPlaceholderText('Add a new task');
    fireEvent.change(taskInput, { target: { value: 'Share deck' } });
    fireEvent.click(screen.getByRole('button', { name: /add task/i }));

    const stagedInput = await screen.findByDisplayValue('Share deck');
    const stagedArticle = stagedInput.closest('article');
    expect(stagedArticle).toBeTruthy();

    const scoped = within(stagedArticle as HTMLElement);
    fireEvent.click(scoped.getByRole('button', { name: /add link/i }));
    const linkTextInput = await scoped.findByLabelText('Link text');
    const linkUrlInput = await scoped.findByLabelText('Link URL');
    const saveLinkButton = scoped.getByRole('button', { name: /save link/i });
    fireEvent.change(linkTextInput, { target: { value: 'Deck' } });
    fireEvent.change(linkUrlInput, { target: { value: 'invalid-url' } });

    expect(saveLinkButton).toBeDisabled();

    const saveButton = await screen.findByRole('button', { name: /save changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onSaveActionPlan).not.toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith(
        'Fix invalid link URLs before saving (use http:// or https://).',
        'error'
      );
    });

    expect(scoped.getByText(/Enter a valid URL/i)).toBeInTheDocument();
  });
});
