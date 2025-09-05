
import type { Opportunity, AccountDetails } from '../types';
import { generateOpportunities, generateAccountDetails } from './mockData';

/**
 * apiService.ts: The Frontend's Gateway to the Backend
 * 
 * This file replaces the old geminiService. Its responsibility is to communicate
 * with the backend API. In a real application, the functions here would use `fetch`
 * to make network requests to your Cloud Run server.
 * 
 * For this prototype, we are *simulating* those API calls. Instead of a real network
 * request, we are importing mock data from `mockData.ts` and returning it inside a
 * Promise. This perfectly mimics the asynchronous nature of a real API without
 * needing a live backend, and ensures the rest of the application is built correctly.
 */

const API_BASE_URL = '/api'; // A conventional base URL for API calls

/**
 * Fetches the main list of opportunities.
 * In a real app, this would make a GET request to `${API_BASE_URL}/opportunities`.
 */
export const fetchOpportunities = async (): Promise<Opportunity[]> => {
  console.log("Simulating API call to GET /api/opportunities...");
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // In a real app:
  // const response = await fetch(`${API_BASE_URL}/opportunities`);
  // if (!response.ok) {
  //   throw new Error('Failed to fetch opportunities');
  // }
  // return await response.json();

  // For the prototype, return mock data:
  return Promise.resolve(generateOpportunities(30));
};

/**
 * Fetches the detailed data for a specific account.
 * In a real app, this would make a GET request to `${API_BASE_URL}/accounts/${accountId}/details`.
 */
export const fetchOpportunityDetails = async (accountId: string): Promise<AccountDetails> => {
    console.log(`Simulating API call to GET /api/accounts/${accountId}/details...`);
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // In a real app:
    // const response = await fetch(`${API_BASE_URL}/accounts/${accountId}/details`);
    // if (!response.ok) {
    //   throw new Error('Failed to fetch opportunity details');
    // }
    // return await response.json();

    // For the prototype, return mock data:
    return Promise.resolve(generateAccountDetails(accountId));
};
