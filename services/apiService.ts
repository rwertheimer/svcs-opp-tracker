

declare global {
  interface ImportMeta {
    readonly env: {
      readonly VITE_USE_MOCK_DATA?: string;
    }
  }
}

import type { Opportunity, AccountDetails, Disposition, User, ActionItem } from '../types';
import { generateOpportunities, generateAccountDetails, MOCK_USERS } from './mockData';

const USE_MOCK_DATA = (import.meta.env?.VITE_USE_MOCK_DATA ?? 'true') === 'true';
const API_BASE_URL = 'http://localhost:8080/api';

// --- NEW: User API ---
export const fetchUsers = async (): Promise<User[]> => {
  if (USE_MOCK_DATA) {
    return Promise.resolve(MOCK_USERS);
  } else {
    const response = await fetch(`${API_BASE_URL}/users`);
    if (!response.ok) throw new Error('Failed to fetch users.');
    return response.json();
  }
};

// --- Opportunity APIs ---
export const fetchOpportunities = async (): Promise<Opportunity[]> => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 500));
    return generateOpportunities(50);
  } else {
    const response = await fetch(`${API_BASE_URL}/opportunities`);
    if (!response.ok) throw new Error('Failed to fetch opportunities. Is the server running?');
    return response.json();
  }
};

export const fetchOpportunityDetails = async (accountId: string): Promise<AccountDetails> => {
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 500));
    return generateAccountDetails(accountId);
  } else {
    try {
      const [supportTicketsRes, usageHistoryRes, projectHistoryRes] = await Promise.all([
        fetch(`${API_BASE_URL}/accounts/${accountId}/support-tickets`),
        fetch(`${API_BASE_URL}/accounts/${accountId}/usage-history`),
        fetch(`${API_BASE_URL}/accounts/${accountId}/project-history`)
      ]);

      if (!supportTicketsRes.ok || !usageHistoryRes.ok || !projectHistoryRes.ok) {
        throw new Error(`Failed to fetch one or more details for account ${accountId}.`);
      }

      return { 
        supportTickets: await supportTicketsRes.json(), 
        usageHistory: await usageHistoryRes.json(), 
        projectHistory: await projectHistoryRes.json() 
      };

    } catch (error) {
      console.error("Error in fetchOpportunityDetails:", error);
      throw error;
    }
  }
};

export const saveDisposition = async (opportunityId: string, disposition: Disposition, userId: string): Promise<Disposition> => {
  if (USE_MOCK_DATA) {
    console.log(`(Mock) Saving disposition for ${opportunityId}`, { ...disposition, version: disposition.version + 1 });
    return Promise.resolve({ ...disposition, version: disposition.version + 1 });
  } else {
    const response = await fetch(`${API_BASE_URL}/opportunities/${opportunityId}/disposition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ disposition, userId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Propagate the status to be handled for optimistic locking
      const error = new Error(`Failed to save disposition: ${response.status} ${errorText}`);
      // FIX: Attach status to the error object so the UI can check for 409 conflicts.
      (error as any).status = response.status;
      throw error;
    }
    return response.json(); // Return the updated disposition with the new version
  }
};

// --- NEW: Action Item APIs ---

export const createActionItem = async (opportunityId: string, item: Omit<ActionItem, 'action_item_id'>): Promise<ActionItem> => {
    if (USE_MOCK_DATA) {
        const newItem = { ...item, action_item_id: `mock-ai-${Date.now()}` };
        console.log("(Mock) Creating action item:", newItem);
        return Promise.resolve(newItem as ActionItem);
    } else {
        const response = await fetch(`${API_BASE_URL}/action-items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ opportunity_id: opportunityId, ...item }),
        });
        if (!response.ok) throw new Error('Failed to create action item');
        return response.json();
    }
};

export const updateActionItem = async (actionItemId: string, updates: Partial<ActionItem>): Promise<ActionItem> => {
     if (USE_MOCK_DATA) {
        console.log(`(Mock) Updating action item ${actionItemId}:`, updates);
        // This won't actually persist in mock mode, but we can simulate success.
        return Promise.resolve({} as ActionItem);
    } else {
        const response = await fetch(`${API_BASE_URL}/action-items/${actionItemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });
        if (!response.ok) throw new Error('Failed to update action item');
        return response.json();
    }
};

export const deleteActionItem = async (actionItemId: string): Promise<void> => {
    if (USE_MOCK_DATA) {
        console.log(`(Mock) Deleting action item ${actionItemId}`);
        return Promise.resolve();
    } else {
        const response = await fetch(`${API_BASE_URL}/action-items/${actionItemId}`, {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete action item');
    }
};