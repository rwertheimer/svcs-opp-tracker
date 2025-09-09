import type { Opportunity, AccountDetails } from '../types';
import { generateOpportunities, generateAccountDetails } from './mockData';

/**
 * apiService.ts: A dual-mode API service for flexible development.
 *
 * This service can operate in two modes, controlled by the `USE_MOCK_DATA` flag.
 * 1. Mock Mode (USE_MOCK_DATA = true): The service uses local mock data. This ensures
 *    the application is self-contained and works perfectly in a browser-only
 *    prototyping environment (like this one).
 * 2. Live Mode (USE_MOCK_DATA = false): The service makes live HTTP requests to a
 *    local backend server. This is for full-stack local development where you are
 *    running the Node.js server from `backend/server.ts` in your terminal.
 */

// --- CONFIGURATION ---
// Set to `true` for browser-based prototyping.
// Set to `false` for local development when running the backend server.
const USE_MOCK_DATA = true;
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
    const data = await response.json();
    // The server fetches real data but doesn't have the 'disposition' field.
    // We add it here to conform to the frontend type.
    return data.map((opp: Omit<Opportunity, 'disposition'>) => ({
      ...opp,
      disposition: {
        status: 'Not Reviewed',
        notes: '',
        actionItems: []
      }
    }));
  }
};

/**
 * Fetches the detailed data for a specific account.
 */
export const fetchOpportunityDetails = async (accountId: string): Promise<AccountDetails> => {
  if (USE_MOCK_DATA) {
    console.log(`Generating mock details for account ${accountId}...`);
    await new Promise(resolve => setTimeout(resolve, 300));
    return generateAccountDetails(accountId);
  } else {
    console.log(`Fetching real details for account ${accountId} from GET ${API_BASE_URL}/accounts/${accountId}/details...`);
    const response = await fetch(`${API_BASE_URL}/accounts/${accountId}/details`);
     if (!response.ok) {
      throw new Error(`Failed to fetch details for account ${accountId}. Is the server running?`);
    }
    return await response.json();
  }
};