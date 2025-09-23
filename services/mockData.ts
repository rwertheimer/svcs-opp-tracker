

import type { Opportunity, AccountDetails, SupportTicket, ProjectHistory, UsageData, ActionItem, Document, User } from '../types';
// FIX: Removed OpportunityStage from import as it does not exist in types.ts
import { ActionItemStatus } from '../types';

// FIX: Added local OpportunityStage enum to resolve missing type and allow MOCK_STAGES to be created correctly.
export enum OpportunityStage {
    Created = '0 - Created',
    Contacted = '1 - Contacted',
    WhyStay = '2 - Why Stay?',
    Selected = '3 - Selected',
    Contract = '4 - Contract',
    Closed = '5 - Closed',
    PreSalesScoping = 'Pre-Sales Scoping',
}

// --- Helper Functions ---
const getRandomId = () => Math.random().toString(36).substring(2, 10);
const getRandomElement = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const createPastDate = (daysAgo: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
};
const createFutureDate = (daysAhead: number) => {
    const date = new Date();
    date.setDate(date.getDate() + daysAhead);
    return date.toISOString().split('T')[0];
};

// --- MOCK DATA CONSTANTS ---
// FIX: Added and exported MOCK_USERS to be used by the mock apiService.
export const MOCK_USERS: User[] = [
    { user_id: 'user-1', name: 'Alice Johnson', email: 'alice.johnson@fivetran.com' },
    { user_id: 'user-2', name: 'Bob Williams', email: 'bob.williams@fivetran.com' },
    { user_id: 'user-3', name: 'Charlie Brown', email: 'charlie.brown@fivetran.com' },
    { user_id: 'user-4', name: 'Diana Miller', email: 'diana.miller@fivetran.com' }
];
const MOCK_ACCOUNTS = ['Globex Corporation', 'Stark Industries', 'Wayne Enterprises', 'Cyberdyne Systems', 'Tyrell Corporation', 'Sirius Cybernetics Corp', 'Monsters, Inc.', 'Acme Corporation'];
const MOCK_OPP_ADJECTIVES = ['Enterprise', 'Strategic', 'High-Value', 'Growth', 'Renewal', 'Expansion', 'Migration'];
const MOCK_OPP_NOUNS = ['Platform Deal', 'Services Engagement', 'Connector Package', 'License Upgrade', 'Database Migration'];
const MOCK_REPS = ['Alice Johnson', 'Bob Williams', 'Charlie Brown', 'Diana Miller'];
const MOCK_REGIONS = ['NA - Enterprise', 'NA - Commercial', 'EMEA', 'APAC'];
const MOCK_STAGES: string[] = Object.values(OpportunityStage).filter(s => s !== OpportunityStage.PreSalesScoping);
const MOCK_OPP_TYPES = ['Renewal', 'New Business', 'Upsell', 'Expansion', 'Sales'];
const MOCK_FORECAST_CATEGORIES = ['Commit', 'Most Likely', 'Upside', 'Omitted'];
const MOCK_WAREHOUSE_SUBTYPES = ['snowflake', 'databricks', 'bigquery', 'redshift'];

// --- Realistic data for the Usage History Table ---
const MOCK_USAGE_ROWS = [
    { table: 'question_response', group: 'PD_COMMUNICATION_PROD', warehouse: 'snowflake', service: 'qualtrics' },
    { table: 'survey_embedded_data', group: 'PD_COMMUNICATION_PROD', warehouse: 'snowflake', service: 'qualtrics' },
    { table: 'RatingFactors', group: 'PD_RATING_RAW', warehouse: 'snowflake', service: 'cosmos' },
    { table: 'RatingResponses', group: 'PD_RATING_RAW', warehouse: 'snowflake', service: 'cosmos' },
    { table: 'Interview', group: 'PD_SALES_RAW', warehouse: 'snowflake', service: 'cosmos' },
    { table: 'Prefill', group: 'PD_SALES_RAW', warehouse: 'snowflake', service: 'cosmos' },
    { table: 'log', group: 'PD_DATAQUALITY', warehouse: 'snowflake', service: 'fivetran_log' },
    { table: 'CarrierIntegrationData', group: 'PD_RATING_RAW', warehouse: 'snowflake', service: 'cosmos' },
    { table: 'log', group: 'PD_COMMUNICATION_PROD', warehouse: 'snowflake', service: 'fivetran_log' },
    { table: 'user', group: 'PD_COMMUNICATION_PROD', warehouse: 'snowflake', service: 'fivetran_log' },
    { table: 'survey_response', group: 'PD_COMMUNICATION_PROD', warehouse: 'snowflake', service: 'qualtrics' },
    { table: 'role_permission', group: 'PD_COMMUNICATION_PROD', warehouse: 'snowflake', service: 'fivetran_log' },
    { table: 'version', group: 'PD_COMMUNICATION_PROD', warehouse: 'snowflake', service: 'qualtrics' },
    { table: 'team_membership', group: 'PD_COMMUNICATION_PROD', warehouse: 'snowflake', service: 'fivetran_log' },
    { table: 'InterviewSummary', group: 'PD_SALES_RAW', warehouse: 'snowflake', service: 'cosmos' },
];

// --- MOCK DATA GENERATION for detail endpoints (restored from backend/server.ts) ---

const generateSupportTickets = (accountId: string): SupportTicket[] => {
    return Array.from({ length: 4 }, (_, i) => ({
        accounts_salesforce_account_id: accountId,
        accounts_outreach_account_link: 'http://example.com',
        accounts_salesforce_account_name: 'Mock Account',
        accounts_owner_name: 'Mock Owner',
        tickets_ticket_url: 'http://example.com',
        tickets_ticket_number: 12345 + i,
        tickets_created_date: createPastDate(i * 10 + 5),
        tickets_status: getRandomElement(['Open', 'Closed', 'In Progress']),
        tickets_subject: `Issue with connector sync #${i+1}`,
        days_open: i * 10 + 5,
        tickets_last_response_from_support_at_date: createPastDate(i + 1),
        tickets_is_escalated: i % 3 === 0 ? 'Yes' : 'No',
        // FIX: Corrected typo from `days_since_last_responce` to `days_since_last_response` to match the SupportTicket type.
        days_since_last_response: i + 1,
        tickets_priority: getRandomElement(['High', 'Medium', 'Low']),
        tickets_new_csat_numeric: i % 2 === 0 ? getRandomElement([3, 4, 5]) : null,
        tickets_engineering_issue_links_c: i === 0 
            ? `https://fivetran.atlassian.net/browse/PROD-12345, https://fivetran.atlassian.net/browse/ENG-67890` 
            : (i === 2 ? `https://fivetran.atlassian.net/browse/DEV-54321` : null),
    }));
};

const generateUsageHistory = (accountId: string): UsageData[] => {
    const usageHistory: UsageData[] = [];
    const now = new Date();
    const services = [...new Set(MOCK_USAGE_ROWS.map(r => r.service))];

    // Generate data for the current month and the previous two months
    for (let i = 2; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthString = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;

        for (const service of services) {
            // Simulate some services not having revenue every month
            if (Math.random() > 0.1) {
                usageHistory.push({
                    month: monthString,
                    service: service,
                    warehouse_subtype: getRandomElement(MOCK_WAREHOUSE_SUBTYPES),
                    annualized_revenue: Math.round(Math.random() * 50000 + 1000),
                    connections_count: Math.floor(Math.random() * 10) + 1,
                });
            }
        }
    }
    return usageHistory;
};

const generateProjectHistory = (accountId: string): ProjectHistory[] => {
    return Array.from({ length: 2 }, (_, i) => ({
        accounts_salesforce_account_id: accountId,
        accounts_outreach_account_link: 'http://example.com',
        accounts_salesforce_account_name: 'Mock Account',
        opportunities_id: `proj-${getRandomId()}`,
        opportunities_name: `Historical Project ${i+1}`,
        opportunities_project_owner_email: 'pm@example.com',
        opportunities_close_date: createPastDate(i * 180 + 90),
        opportunities_rl_open_project_new_end_date: createPastDate(i * 180),
        opportunities_subscription_end_date: createPastDate(i * 180 - 30),
        opportunities_budgeted_hours: 100 + i * 20,
        opportunities_billable_hours: 80.5 + i * 25.2,
        opportunities_non_billable_hours: 5.1 + i * 2.3,
        opportunities_remaining_billable_hours: 20 - i * 5,
    }));
};

export const generateAccountDetails = (accountId: string): AccountDetails => {
  return {
    supportTickets: generateSupportTickets(accountId),
    usageHistory: generateUsageHistory(accountId),
    projectHistory: generateProjectHistory(accountId),
  };
};

// --- Main Mock Data Generation ---

const generatePreDispositionedOpp = (): Opportunity => {
    const opportunityId = 'demo-fit-opp-123';
    // FIX: Corrected ActionItem structure to use `action_item_id`, `due_date`, and added required fields.
    const defaultActionItems: ActionItem[] = [
        {
            action_item_id: 'task-1',
            opportunity_id: opportunityId,
            name: 'Initial Scoping Call',
            status: ActionItemStatus.Completed,
            due_date: createPastDate(10),
            documents: [],
            created_by_user_id: MOCK_USERS[0].user_id,
            assigned_to_user_id: MOCK_USERS[0].user_id,
        },
        {
            action_item_id: 'task-2',
            opportunity_id: opportunityId,
            name: 'Develop Initial Proposal',
            status: ActionItemStatus.InProgress,
            due_date: createFutureDate(2),
            documents: [
                { id: 'doc-1', text: 'Proposal Template', url: 'http://example.com/template' },
            ],
            created_by_user_id: MOCK_USERS[0].user_id,
            assigned_to_user_id: MOCK_USERS[0].user_id,
        },
        {
            action_item_id: 'task-3',
            opportunity_id: opportunityId,
            name: 'Share Initial Proposal',
            status: ActionItemStatus.NotStarted,
            due_date: createFutureDate(7),
            documents: [],
            created_by_user_id: MOCK_USERS[0].user_id,
            assigned_to_user_id: MOCK_USERS[0].user_id,
        },
        {
            action_item_id: 'task-4',
            opportunity_id: opportunityId,
            name: 'Revise and Finalize Proposal',
            status: ActionItemStatus.NotStarted,
            due_date: createFutureDate(14),
            documents: [],
            created_by_user_id: MOCK_USERS[0].user_id,
            assigned_to_user_id: MOCK_USERS[0].user_id,
        },
        {
            action_item_id: 'task-5',
            opportunity_id: opportunityId,
            name: 'Approvals',
            status: ActionItemStatus.NotStarted,
            due_date: createFutureDate(21),
            documents: [],
            created_by_user_id: MOCK_USERS[0].user_id,
            assigned_to_user_id: MOCK_USERS[0].user_id,
        },
    ];
    const closeDate = createFutureDate(45);
    const servicesAmount = 25000;

    return {
        opportunities_id: opportunityId,
        opportunities_name: 'Strategic Platform Migration',
        opportunities_subscription_start_date: createPastDate(180),
        opportunities_stage_name: OpportunityStage.Selected,
        opportunities_owner_name: 'Alice Johnson',
        opportunities_renewal_date_on_creation_date: createPastDate(0),
        opportunities_automated_renewal_status: 'Auto-renews',
        accounts_dollars_months_left: 6,
        opportunities_has_services_flag: 'Yes',
        opportunities_amount_services: servicesAmount,
        accounts_outreach_account_link: 'http://example.com',
        accounts_salesforce_account_name: 'Stark Industries',
        accounts_primary_fivetran_account_status: 'Active',
        opportunities_quoted_products: 'All',
        opportunities_product_being_pitched: 'Enterprise Package',
        accounts_se_territory_owner_email: 'sa@example.com',
        opportunities_connectors: 'Oracle, SAP, Salesforce',
        opportunities_connector_tshirt_size_list: 'XL, L, M',
        opportunities_destinations: 'Snowflake',
        opportunities_type: 'Expansion',
        accounts_region_name: 'NA - Enterprise',
        accounts_salesforce_account_id: `acc-stark-industries-demo`,
        opportunities_manager_of_opp_email: 'manager@example.com',
        accounts_subscription_end_date: closeDate,
        opportunities_close_date: closeDate,
        opportunities_incremental_bookings: 150000,
        opportunities_amount: 500000,
        opportunities_forecast_category: 'Commit',
        opportunities_services_forecast_sfdc: servicesAmount * 0.9,
        disposition: {
            status: 'Services Fit',
            notes: 'This is a high-priority opportunity. Customer wants to migrate their legacy Oracle DB to Snowflake and needs significant help with the data replication strategy.',
            // FIX: Removed `actionItems` from `disposition` as it belongs on the Opportunity object.
            version: 1,
            last_updated_by_user_id: MOCK_USERS[0].user_id,
        },
        // FIX: Added `actionItems` to the top-level Opportunity object.
        actionItems: defaultActionItems
    };
};

export const generateOpportunities = (count: number): Opportunity[] => {
    const opportunities: Opportunity[] = [];
    
    // Add one pre-dispositioned opportunity for demo purposes
    opportunities.push(generatePreDispositionedOpp());

    for (let i = 0; i < count -1; i++) {
        const accountName = getRandomElement(MOCK_ACCOUNTS);
        const servicesAmount = Math.floor(Math.random() * 5) * 5000;
        const forecastCategory = getRandomElement(MOCK_FORECAST_CATEGORIES);

        // Ensure some opportunities match the default filter criteria
        const isNAregion = Math.random() > 0.3;
        const closeDateInNext90Days = Math.random() > 0.3;
        const closeDate = closeDateInNext90Days ? createFutureDate(Math.floor(Math.random() * 90)) : createFutureDate(90 + Math.floor(Math.random() * 275));

        const opp: Opportunity = {
            opportunities_id: getRandomId(),
            opportunities_name: `${getRandomElement(MOCK_OPP_ADJECTIVES)} ${getRandomElement(MOCK_OPP_NOUNS)}`,
            opportunities_subscription_start_date: createPastDate(Math.floor(Math.random() * 365)),
            // FIX: Ensured `getRandomElement(MOCK_STAGES)` correctly returns a string.
            opportunities_stage_name: getRandomElement(MOCK_STAGES),
            opportunities_owner_name: getRandomElement(MOCK_REPS),
            opportunities_renewal_date_on_creation_date: createPastDate(0),
            opportunities_automated_renewal_status: getRandomElement(['Auto-renews', 'Does not auto-renew']),
            accounts_dollars_months_left: Math.floor(Math.random() * 12) + 1,
            opportunities_has_services_flag: Math.random() > 0.5 ? 'Yes' : 'No',
            opportunities_amount_services: servicesAmount,
            accounts_outreach_account_link: 'http://example.com',
            accounts_salesforce_account_name: accountName,
            accounts_primary_fivetran_account_status: 'Active',
            opportunities_quoted_products: 'Various',
            opportunities_product_being_pitched: 'Various',
            accounts_se_territory_owner_email: 'sa@example.com',
            opportunities_connectors: 'Salesforce, BigQuery',
            opportunities_connector_tshirt_size_list: 'M, L',
            opportunities_destinations: 'Snowflake',
            opportunities_type: getRandomElement(MOCK_OPP_TYPES),
            accounts_region_name: isNAregion ? getRandomElement(['NA - Enterprise', 'NA - Commercial']) : getRandomElement(['EMEA', 'APAC']),
            accounts_salesforce_account_id: `acc-${accountName.toLowerCase().replace(/ /g, '-')}-${getRandomId()}`,
            opportunities_manager_of_opp_email: 'manager@example.com',
            accounts_subscription_end_date: closeDate,
            opportunities_close_date: closeDate,
            opportunities_incremental_bookings: Math.floor(Math.random() * 50000),
            opportunities_amount: Math.floor(Math.random() * 25 + 5) * 10000,
            opportunities_forecast_category: forecastCategory,
            opportunities_services_forecast_sfdc: servicesAmount * (MOCK_FORECAST_CATEGORIES.indexOf(forecastCategory) * 0.25),
            disposition: {
                status: 'Not Reviewed',
                notes: '',
                version: 1,
                last_updated_by_user_id: MOCK_USERS[0].user_id,
            },
            // FIX: Added `actionItems` to the top-level Opportunity object.
            actionItems: []
        };
        opportunities.push(opp);
    }
    return opportunities;
};