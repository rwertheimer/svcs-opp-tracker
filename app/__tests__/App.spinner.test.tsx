import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../../App';
import { ToastProvider } from '../../components/Toast';

vi.mock('../../services/apiService', () => {
  const delayed = <T,>(value: T, ms = 15) => new Promise<T>(resolve => setTimeout(() => resolve(value), ms));
  return {
    fetchUsers: vi.fn().mockResolvedValue([{ user_id: 'u1', name: 'Alice', email: 'a@x.com' }]),
    // Delay opportunities to ensure spinner is visible while loading
    fetchOpportunities: vi.fn().mockImplementation(() => delayed([])),
    fetchOpportunityDetails: vi.fn(),
    saveDispositionActionPlan: vi.fn(),
    updateActionItem: vi.fn(),
    fetchSavedViews: vi.fn().mockResolvedValue([]),
    createSavedView: vi.fn(),
    updateSavedView: vi.fn(),
    deleteSavedView: vi.fn(),
    setDefaultSavedView: vi.fn(),
  };
});

describe('App initial spinner', () => {
  it('shows full-page spinner when loading with no data', async () => {
    render(
      <ToastProvider>
        <App />
      </ToastProvider>
    );
    expect(screen.getByText(/Loading Data.../i)).toBeInTheDocument();
  });
});
