
// Fix: The /// <reference types="vite/client" /> directive was causing a "Cannot find type definition file" error.
// To resolve this and the subsequent error on `import.meta.env`, we provide a minimal global
// type definition for `import.meta.env` to satisfy TypeScript.
declare global {
  interface ImportMeta {
    readonly env: {
      readonly VITE_USE_MOCK_DATA?: string;
    }
  }
}

import type { Opportunity, AccountDetails, Disposition } from '../types';
import { generateOpportunities, generateAccountDetails } from './mockData';

/**
 * apiService.ts: A dual-mode API service for flexible development.
 *
 * This service can operate in two modes, controlled by an environment variable.
 * Create a local .env file (copy from .env.example) to control the mode.
 *
 * 1. Mock Mode (VITE_USE_MOCK_DATA = 'true'): The service uses local mock data. This ensures
 *    the application is self-contained and works in a browser-only environment.
 * 2. Live Mode (VITE_USE_MOCK_DATA = 'false'): The service makes live HTTP requests to a
 *    local backend server (e.g., http://localhost:8080).
 */

// --- CONFIGURATION ---
// The app mode is now controlled by an environment variable.
// In your local .env file, set VITE_USE_MOCK_DATA=false to connect to the backend.
// Vite automatically loads .env files. The VITE_ prefix is required.
const USE_MOCK_DATA = (import.meta.env?.VITE_USE_MOCK_DATA ?? 'true') === 'true';
const API_BASE_URL = 'http://localhost:8080/api';

/**
 * Fetches the main list of opportunities.
 */
export const fetchOpportunities = async (): Promise<Opportunity[]> => {
  if (USE_MOCK_DATA) {
    console.log("Fetching opportunities from local mock data...");
    await new Promise(resolve => setTimeout(resolve, 500));
    return generateOpportunities(50);
  } else {
    console.log(`Fetching real opportunities from GET ${API_BASE_URL}/opportunities...`);
    const response = await fetch(`${API_BASE_URL}/opportunities`);
    if (!response.ok) {
      throw new Error('Failed to fetch opportunities from the backend. Is the server running?');
    }
    // Backend now provides the disposition object, including defaults for null records.
    return response.json();
  }
};

/**
 * Fetches the detailed data for a specific account by calling multiple specialized endpoints.
 */
export const fetchOpportunityDetails = async (accountId: string): Promise<AccountDetails> => {
  if (USE_MOCK_DATA) {
    console.log(`Generating mock details for account ${accountId}...`);
    await new Promise(resolve => setTimeout(resolve, 500));
    return generateAccountDetails(accountId);
  } else {
    console.log(`Fetching real details for account ${accountId} from backend endpoints...`);

    try {
      const [supportTicketsRes, usageHistoryRes, projectHistoryRes] = await Promise.all([
        fetch(`${API_BASE_URL}/accounts/${accountId}/support-tickets`),
        fetch(`${API_BASE_URL}/accounts/${accountId}/usage-history`),
        fetch(`${API_BASE_URL}/accounts/${accountId}/project-history`)
      ]);

      if (!supportTicketsRes.ok || !usageHistoryRes.ok || !projectHistoryRes.ok) {
        // Log the status for better debugging
        console.error('Support Tickets Status:', supportTicketsRes.status);
        console.error('Usage History Status:', usageHistoryRes.status);
        console.error('Project History Status:', projectHistoryRes.status);
        throw new Error(`Failed to fetch one or more details for account ${accountId}. Is the server running?`);
      }

      const supportTickets = await supportTicketsRes.json();
      const usageHistory = await usageHistoryRes.json();
      const projectHistory = await projectHistoryRes.json();

      return { supportTickets, usageHistory, projectHistory };

    } catch (error) {
      console.error("Error in fetchOpportunityDetails:", error);
      throw error; // Re-throw the error to be caught by the calling component
    }
  }
};

/**
 * Saves a disposition for a specific opportunity.
 * In mock mode, this is a no-op that resolves successfully.
 * In live mode, it sends the data to the backend.
 */
export const saveDisposition = async (opportunityId: string, disposition: Disposition): Promise<void> => {
  if (USE_MOCK_DATA) {
    console.log(`(In-Memory) Saving disposition for ${opportunityId}`, disposition);
    // In mock mode, this is a no-op as state is handled optimistically in the UI.
    return Promise.resolve();
  } else {
    console.log(`Saving real disposition for ${opportunityId} to POST ${API_BASE_URL}/opportunities/${opportunityId}/disposition...`);
    
    const response = await fetch(`${API_BASE_URL}/opportunities/${opportunityId}/disposition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ disposition }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to save disposition: ${response.status} ${errorText}`);
    }
    // A successful 2xx response is sufficient.
  }
};
