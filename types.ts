
/**
 * types.ts: The Single Source of Truth for Data Shapes
 * 
 * This file defines the data structures for the multi-user, relational architecture.
 */

// --- ENUMS ---

export enum ActionItemStatus {
    NotStarted = 'Not Started',
    InProgress = 'In Progress',
    Completed = 'Completed',
}

export type DispositionStatus = 'Services Fit' | 'No Action Needed' | 'Not Reviewed' | 'Watchlist';


// --- CORE DATA MODELS ---

/**
 * Represents a user of the application.
 */
export interface User {
    user_id: string;
    name: string;
    email: string;
}

/**
 * Represents an Action Item, now a first-class object linked to an opportunity and users.
 */
export interface ActionItem {
    action_item_id: string;
    opportunity_id: string;
    name: string;
    status: ActionItemStatus;
    due_date: string; // Stored as 'YYYY-MM-DD'
    notes: string;
    documents: Document[]; // Stored as JSONB in the database
    created_by_user_id: string;
    assigned_to_user_id: string;
}

/**
 * Represents the main Opportunity object, fetched from the database.
 * This corresponds to the `opportunities` table schema.
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
    opportunities_amount_services: number | null;
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
    opportunities_close_date: string;
    opportunities_incremental_bookings: number;
    opportunities_amount: number;
    opportunities_forecast_category: string;
    opportunities_services_forecast_sfdc: number;

    // App-specific state, now stored relationally or in a versioned JSONB column
    disposition: Disposition;
    actionItems: ActionItem[];
}

/**
 * Represents the user-driven disposition state stored in the `disposition` JSONB column.
 * This is now versioned to support optimistic locking.
 */
export interface Disposition {
    status: DispositionStatus;
    notes: string;
    reason?: string;
    services_amount_override?: number;
    forecast_category_override?: string;
    
    // --- Multi-User & Concurrency Control ---
    version: number;
    last_updated_by_user_id: string;
    last_updated_at?: string; // Can be added by the backend
}


// --- DETAIL VIEW & COMPOSITE TYPES ---

export interface Document {
    id: string;
    text: string;
    url: string;
}

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
    days_since_last_response: number;
    tickets_priority: string;
    tickets_new_csat_numeric: number | null;
    tickets_engineering_issue_links_c: string | null;
}

export interface UsageData {
    month: string;
    service: string;
    warehouse_subtype: string;
    annualized_revenue: number;
    connections_count: number;
}

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

export interface AccountDetails {
  supportTickets: SupportTicket[];
  usageHistory: UsageData[];
  projectHistory: ProjectHistory[];
}

export interface TaskWithOpportunityContext extends ActionItem {
    opportunityId: string;
    opportunityName: string;
    accountName: string;
}


// --- ADVANCED FILTER BUILDER ---

export type FilterField = string;
export type FilterOperator = 'contains' | 'not_contains' | 'equals' | 'not_equals' | 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq' | 'before' | 'after' | 'on' | 'is' | 'is_not';
export type FilterCombinator = 'AND' | 'OR';

export interface FilterRule {
  id: string;
  field: FilterField;
  operator: FilterOperator;
  value: any;
}

export interface FilterGroup {
  id: string;
  combinator: FilterCombinator;
  rules: (FilterRule | FilterGroup)[];
}

export interface SavedFilter {
  id: string;
  name: string;
  criteria: FilterGroup;
  createdAt?: string;
  updatedAt?: string;
  origin?: 'orgChart' | 'manual' | 'other';
  description?: string;
  isDefault?: boolean;
}
