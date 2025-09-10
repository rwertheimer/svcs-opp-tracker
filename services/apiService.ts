import type { Opportunity, AccountDetails } from '../types';
import { generateOpportunities } from './mockData';

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
const USE_MOCK_DATA = false;
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
 * Fetches the detailed data for a specific account by calling multiple specialized endpoints.
 */
export const fetchOpportunityDetails = async (accountId: string): Promise<AccountDetails> => {
  if (USE_MOCK_DATA) {
    // This mode is now deprecated in favor of the backend service,
    // but kept for reference or standalone frontend work.
    console.warn("USE_MOCK_DATA is true for details, but this is deprecated. Using backend mock endpoints is preferred.");
    console.log(`Generating mock details for account ${accountId}...`);
    // Simulating the old behavior would require re-importing mock data generator.
    // The primary path is now the 'else' block.
    throw new Error("Mock data generation for details has been moved to the backend. Please set USE_MOCK_DATA to false.");
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