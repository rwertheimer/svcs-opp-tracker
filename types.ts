/**
 * types.ts: The Single Source of Truth for Data Shapes
 * 
 * This file has been completely updated to match the exact schemas returned by your BigQuery SQL.
 * Each interface now directly corresponds to the columns and aliases from a specific query.
 * This ensures data consistency and provides a strong "contract" for the entire application.
 */

// A general enum for Opportunity Stage, inferred from common CRM stages.
// The app will treat the stage_name from SQL as a string, but this is used for filtering UI.
export enum OpportunityStage {
  Created = '0 - Created',
  Contacted = '1 - Contacted',
  WhyStay = '2 - Why Stay?',
  Selected = '3 - Selected',
  Contract = '4 - Contract',
  Closed = '5 - Closed',
  PreSalesScoping = 'Pre-Sales Scoping',
}

export enum ActionItemStatus {
    NotStarted = 'Not Started',
    InProgress = 'In Progress',
    Completed = 'Completed',
}

export type DispositionStatus = 'Services Fit' | 'No Action Needed' | 'Not Reviewed' | 'Watchlist';

/**
 * Based on the "full opportunities table" SQL query.
 */
export interface Opportunity {
    opportunities_id: string;
    opportunities_name: string;
    opportunities_subscription_start_date: string;
    opportunities_stage_name: string;
    opportunities_owner_name: string;
    opportunities_renewal_date_on_creation_date: string;
    opportunities_automated_renewal_status: string;
    accounts_dollars_months_left: number | null;
    opportunities_has_services_flag: 'Yes' | 'No';
    opportunities_amount_services: number;
    accounts_outreach_account_link: string;
    accounts_salesforce_account_name: string;
    accounts_primary_fivetran_account_status: string;
    opportunities_quoted_products: string;
    opportunities_product_being_pitched: string;
    accounts_se_territory_owner_email: string;
    opportunities_connectors: string;
    opportunities_connector_tshirt_size_list: string;
    opportunities_destinations: string;
    opportunities_type: string;
    accounts_region_name: string;
    accounts_salesforce_account_id: string;
    opportunities_manager_of_opp_email: string;
    accounts_subscription_end_date: string;
    opportunities_close_date: string; // Added new close date field
    opportunities_incremental_bookings: number;
    opportunities_amount: number;

    // --- New fields for Forecasting ---
    opportunities_forecast_category: string; // From SFDC, e.g., 'Commit', 'Best Case'
    opportunities_services_forecast_sfdc: number; // The calculated forecast from SFDC

    // App-specific state, not from BigQuery
    disposition?: Disposition;
}

/**
 * Based on the "Account-level Support tickets table" SQL query.
 */
export interface SupportTicket {
    accounts_salesforce_account_id: string;
    accounts_outreach_account_link: string;
    accounts_salesforce_account_name: string;
    accounts_owner_name: string;
    tickets_ticket_url: string;
    tickets_ticket_number: number;
    tickets_created_date: string;
    tickets_status: string;
    tickets_subject: string;
    days_open: number;
    tickets_last_response_from_support_at_date: string;
    tickets_is_escalated: 'Yes' | 'No';
    days_since_last_responce: number;
    tickets_priority: string;
}

/**
 * Based on the "Account-level usage history table" SQL query.
 */
export interface UsageData {
    accounts_timeline_date_month: string;
    connections_table_timeline_table_name: string;
    connections_group_name: string;
    connections_warehouse_subtype: string;
    connections_timeline_service_eom: string;
    connections_table_timeline_raw_volume_updated: number;
    connections_table_timeline_total_billable_volume: number;
}

/**
 * Based on the "Account-level project history table" SQL query.
 */
export interface ProjectHistory {
    accounts_salesforce_account_id: string;
    accounts_outreach_account_link: string;
    accounts_salesforce_account_name: string;
    opportunities_id: string;
    opportunities_name: string;
    opportunities_project_owner_email: string;
    opportunities_close_date: string;
    opportunities_rl_open_project_new_end_date: string;
    opportunities_subscription_end_date: string;
    opportunities_budgeted_hours: number;
    opportunities_billable_hours: number;
    opportunities_non_billable_hours: number;
    opportunities_remaining_billable_hours: number;
}

/**
 * A composite type for the detailed view, containing the results
 * of on-demand queries for a specific account.
 */
export interface AccountDetails {
  supportTickets: SupportTicket[];
  usageHistory: UsageData[];
  projectHistory: ProjectHistory[];
}

// --- App-specific interfaces that are not tied to a SQL schema ---

export interface Disposition {
    status: DispositionStatus;
    notes: string;
    actionItems: ActionItem[];
    reason?: string;
    // --- New fields for Forecasting Overrides ---
    services_amount_override?: number;
    forecast_category_override?: string;
}

export interface Document {
    id: string;
    text: string;
    url: string;
}

export interface ActionItem {
    id: string;
    name: string;
    status: ActionItemStatus;
    dueDate: string;
    notes: string;
    documents?: Document[];
}

// --- Interfaces for the new Advanced Filter Builder ---

export type FilterField = keyof Opportunity;

export type FilterOperator = 
  // Text
  | 'contains' | 'not_contains' | 'equals' | 'not_equals' 
  // Number
  | 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq'
  // Date
  | 'before' | 'after' | 'on'
  // Select
  | 'is' | 'is_not';


export interface FilterRule {
  id: string;
  field: FilterField;
  operator: FilterOperator;
  value: any;
}

export type FilterCombinator = 'AND' | 'OR';

export interface FilterGroup {
  id: string;
  combinator: FilterCombinator;
  rules: (FilterRule | FilterGroup)[];
}

// Kept for saved views, but not used for active filtering anymore
export interface FilterCriteria {
  searchTerm: string;
  statuses: OpportunityStage[];
  salesReps: string[];
  disposition: 'any' | 'services-fit' | 'no-services-opp' | 'not-reviewed' | 'watchlist';
  minDealSize: number | null;
  maxDealSize: number | null;
}

export interface SavedFilter {
  id: string;
  name: string;
  criteria: FilterGroup; // Now saves the advanced filter structure
}

export interface TaskWithOpportunityContext extends ActionItem {
    opportunityId: string;
    opportunityName: string;
    accountName: string;
}