

declare global {
  interface ImportMeta {
    readonly env: {
      readonly VITE_USE_MOCK_DATA?: string;
      readonly VITE_SAVED_VIEWS_API?: string;
    }
  }
}

import type { Opportunity, AccountDetails, Disposition, User, ActionItem, SavedFilter } from '../types';
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

// --- NEW: Saved Views APIs (multi-user persistence) ---

type BackendSavedView = {
  view_id: string;
  user_id: string;
  name: string;
  criteria: any;
  origin?: string | null;
  description?: string | null;
  isDefault: boolean; // mapped in backend
  createdAt: string;
  updatedAt: string;
};

const mapView = (v: any): SavedFilter => ({
  id: v.id ?? v.view_id,
  name: v.name,
  criteria: v.criteria,
  origin: v.origin ?? undefined,
  description: v.description ?? undefined,
  isDefault: v.isDefault ?? v.is_default,
  createdAt: v.createdAt ?? v.created_at,
  updatedAt: v.updatedAt ?? v.updated_at,
} as SavedFilter);

export const fetchSavedViews = async (userId: string): Promise<SavedFilter[]> => {
  const res = await fetch(`${API_BASE_URL}/users/${userId}/views`);
  if (!res.ok) throw new Error('Failed to fetch saved views');
  const data = await res.json();
  return data.map(mapView);
};

export const createSavedView = async (
  userId: string,
  payload: Pick<SavedFilter, 'name' | 'criteria' | 'origin' | 'description'> & { isDefault?: boolean }
): Promise<SavedFilter> => {
  const res = await fetch(`${API_BASE_URL}/users/${userId}/views`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: payload.name,
      criteria: payload.criteria,
      origin: payload.origin ?? null,
      description: payload.description ?? null,
      is_default: payload.isDefault === true,
    }),
  });
  if (res.status === 409) {
    const err: any = new Error('Name conflict');
    err.status = 409;
    throw err;
  }
  if (!res.ok) throw new Error('Failed to create saved view');
  return mapView(await res.json());
};

export const updateSavedView = async (
  userId: string,
  viewId: string,
  payload: Partial<Pick<SavedFilter, 'name' | 'criteria' | 'origin' | 'description' | 'isDefault'>>
): Promise<SavedFilter> => {
  const body: any = {};
  if (payload.name !== undefined) body.name = payload.name;
  if (payload.criteria !== undefined) body.criteria = payload.criteria;
  if (payload.origin !== undefined) body.origin = payload.origin;
  if (payload.description !== undefined) body.description = payload.description;
  if (payload.isDefault !== undefined) body.is_default = payload.isDefault;
  const res = await fetch(`${API_BASE_URL}/users/${userId}/views/${viewId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 409) {
    const err: any = new Error('Name conflict');
    err.status = 409;
    throw err;
  }
  if (!res.ok) throw new Error('Failed to update saved view');
  return mapView(await res.json());
};

export const deleteSavedView = async (userId: string, viewId: string): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/users/${userId}/views/${viewId}`, { method: 'DELETE' });
  if (res.status === 404) throw new Error('Not found');
  if (!res.ok && res.status !== 204) throw new Error('Failed to delete saved view');
};

export const setDefaultSavedView = async (userId: string, viewId: string): Promise<SavedFilter> => {
  const res = await fetch(`${API_BASE_URL}/users/${userId}/views/${viewId}/default`, { method: 'PUT' });
  if (!res.ok) throw new Error('Failed to set default view');
  return mapView(await res.json());
};
