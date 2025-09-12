import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Opportunity, AccountDetails, Disposition, SavedFilter, TaskWithOpportunityContext, ActionItem, FilterGroup } from './types';
import { fetchOpportunities, fetchOpportunityDetails, saveDisposition } from './services/apiService';
import OpportunityList from './components/OpportunityList';
import OpportunityDetail from './components/OpportunityDetail';
import Header from './components/Header';
import LoadingSpinner from './components/LoadingSpinner';
import TaskCockpit from './components/TaskCockpit';
import AddScopingModal from './components/AddScopingModal';
import AdvancedFilterBuilder from './components/AdvancedFilterBuilder';

const initialFilterGroup: FilterGroup = {
    id: 'root',
    combinator: 'AND',
    rules: [],
};

// Helper to safely access nested property values using a dot-notation string.
const getNestedValue = (obj: any, path: string): any => {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

const App: React.FC = () => {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [selectedOpportunityDetails, setSelectedOpportunityDetails] = useState<AccountDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterGroup>(initialFilterGroup);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [activeView, setActiveView] = useState<'opportunities' | 'tasks'>('opportunities');
  const [isScopingModalOpen, setIsScopingModalOpen] = useState(false);
  const [isFilterBuilderOpen, setIsFilterBuilderOpen] = useState(false);


  const loadOpportunities = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const fetchedOpportunities = await fetchOpportunities();
      setOpportunities(fetchedOpportunities);
    } catch (err) {
      setError('Failed to fetch opportunities. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOpportunities();
  }, [loadOpportunities]);
  
  const evaluateFilterGroup = (opp: Opportunity, group: FilterGroup): boolean => {
    const results = group.rules.map(rule => {
      if ('combinator' in rule) { // It's a nested group
        return evaluateFilterGroup(opp, rule);
      } else { // It's a rule
        const value = getNestedValue(opp, rule.field);
        if (value === null || value === undefined) return false;
        
        const ruleValue = rule.value;
        const oppValue = typeof value === 'string' ? value.toLowerCase() : value;

        switch (rule.operator) {
          // Text
          case 'contains': return oppValue.toString().toLowerCase().includes(ruleValue.toLowerCase());
          case 'not_contains': return !oppValue.toString().toLowerCase().includes(ruleValue.toLowerCase());
          case 'equals': return oppValue.toString().toLowerCase() === ruleValue.toLowerCase();
          case 'not_equals': return oppValue.toString().toLowerCase() !== ruleValue.toLowerCase();
          // Number
          case 'eq': return oppValue === Number(ruleValue);
          case 'neq': return oppValue !== Number(ruleValue);
          case 'gt': return (oppValue as number) > Number(ruleValue);
          case 'gte': return (oppValue as number) >= Number(ruleValue);
          case 'lt': return (oppValue as number) < Number(ruleValue);
          case 'lte': return (oppValue as number) <= Number(ruleValue);
          // Date
          case 'on': return new Date(oppValue as string).toDateString() === new Date(ruleValue).toDateString();
          case 'before': return new Date(oppValue as string) < new Date(ruleValue);
          case 'after': return new Date(oppValue as string) > new Date(ruleValue);
          // Select
          case 'is': return oppValue === ruleValue;
          case 'is_not': return oppValue !== ruleValue;
          default: return false;
        }
      }
    });

    if (group.combinator === 'AND') {
      return results.every(res => res);
    } else {
      return results.some(res => res);
    }
  };


  const filteredOpportunities = useMemo(() => {
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

    // Apply the base filter first as per requirements
    const baseFilteredOpps = opportunities.filter(opp => {
      const allowedTypes = ['Renewal', 'New Business', 'Upsell', 'Expansion'];
      const typeMatch = allowedTypes.includes(opp.opportunities_type);
      const regionMatch = opp.accounts_region_name === 'NA - Enterprise' || opp.accounts_region_name === 'NA - Commercial';
      
      const closeDate = new Date(opp.opportunities_close_date);
      const subscriptionEndDate = new Date(opp.accounts_subscription_end_date);
      const dateMatch = (closeDate <= ninetyDaysFromNow) || (subscriptionEndDate <= ninetyDaysFromNow);

      const stageNameLower = opp.opportunities_stage_name.toLowerCase();
      const stageMatch = !stageNameLower.includes('closed') && !stageNameLower.includes('won') && !stageNameLower.includes('lost');

      return typeMatch && regionMatch && dateMatch && stageMatch;
    });

    // Then apply the user's advanced filters
    if (filters.rules.length === 0) {
        return baseFilteredOpps;
    }
    return baseFilteredOpps.filter(opp => evaluateFilterGroup(opp, filters));

  }, [opportunities, filters]);

  const allTasks = useMemo((): TaskWithOpportunityContext[] => {
    return opportunities.flatMap(opp => 
      opp.disposition?.actionItems.map(item => ({
        ...item,
        opportunityId: opp.opportunities_id,
        opportunityName: opp.opportunities_name,
        accountName: opp.accounts_salesforce_account_name,
      })) || []
    );
  }, [opportunities]);


  const handleSelectOpportunity = async (opportunity: Opportunity) => {
    setActiveView('opportunities');
    setSelectedOpportunity(opportunity);
    try {
      setIsLoading(true);
      setError(null);
      const details = await fetchOpportunityDetails(opportunity.accounts_salesforce_account_id);
      setSelectedOpportunityDetails(details);
    } catch (err) {
      setError('Failed to fetch opportunity details.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSelectOpportunityById = (opportunityId: string) => {
    const opportunity = opportunities.find(opp => opp.opportunities_id === opportunityId);
    if (opportunity) {
        handleSelectOpportunity(opportunity);
    } else {
        console.warn(`Could not find opportunity with ID: ${opportunityId}`);
    }
};

  const handleGoBack = () => {
    setSelectedOpportunity(null);
    setSelectedOpportunityDetails(null);
  };
  
  const handleSaveDisposition = (disposition: Disposition) => {
    if (!selectedOpportunity) return;

    const updatedOpportunity = { ...selectedOpportunity, disposition };
    const opportunityId = selectedOpportunity.opportunities_id;

    // Update the disposition in the main opportunities list (in-memory only).
    setOpportunities(prevOpps =>
      prevOpps.map(opp =>
        opp.opportunities_id === opportunityId ? updatedOpportunity : opp
      )
    );
    
    // The disposition is now only saved in the local session state.
    // Close the detail view and return to the updated list.
    handleGoBack();
  };
  
  const handleTaskUpdate = (taskId: string, opportunityId: string, updates: Partial<ActionItem>) => {
    setOpportunities(prevOpps =>
      prevOpps.map(opp => {
        if (opp.opportunities_id === opportunityId && opp.disposition) {
          const updatedActionItems = opp.disposition.actionItems.map(item =>
            item.id === taskId ? { ...item, ...updates } : item
          );
          return {
            ...opp,
            disposition: {
              ...opp.disposition,
              actionItems: updatedActionItems,
            },
          };
        }
        return opp;
      })
    );
  };

  const handleApplyAdvancedFilters = (newFilters: FilterGroup) => {
    setFilters(newFilters);
    setIsFilterBuilderOpen(false);
  }

  const handleSaveFilter = (name: string) => {
    if (!name.trim()) return;
    const newSavedFilter: SavedFilter = {
        id: Date.now().toString(),
        name,
        criteria: { ...filters }
    };
    setSavedFilters(prev => [...prev, newSavedFilter]);
  };

  const handleApplySavedFilter = (id: string) => {
    const savedFilter = savedFilters.find(f => f.id === id);
    if (savedFilter) {
        setFilters(savedFilter.criteria);
    }
  };

  const handleClearFilters = () => {
    setFilters(initialFilterGroup);
  };
  
  const handleSaveScopingActivity = (data: { accountName: string; contact: string; description: string; }) => {
    // This creates a new opportunity object that conforms to the new SQL-aligned schema
    const newScopingOpp: Opportunity = {
      opportunities_id: `scoping-${Date.now()}`,
      opportunities_name: `Scoping: ${data.description.substring(0, 30)}...`,
      opportunities_subscription_start_date: new Date().toISOString(),
      opportunities_stage_name: 'Pre-Sales Scoping',
      opportunities_owner_name: 'N/A',
      opportunities_renewal_date_on_creation_date: new Date().toISOString(),
      opportunities_automated_renewal_status: 'N/A',
      accounts_dollars_months_left: 0,
      opportunities_has_services_flag: 'No',
      opportunities_amount_services: 0,
      accounts_outreach_account_link: '',
      accounts_salesforce_account_name: data.accountName,
      accounts_primary_fivetran_account_status: 'Active',
      opportunities_quoted_products: '',
      opportunities_product_being_pitched: 'Services',
      accounts_se_territory_owner_email: '',
      opportunities_connectors: '',
      opportunities_connector_tshirt_size_list: '',
      opportunities_destinations: '',
      opportunities_type: 'Scoping',
      accounts_region_name: 'N/A',
      accounts_salesforce_account_id: `acc-scoping-${Date.now()}`,
      opportunities_manager_of_opp_email: '',
      accounts_subscription_end_date: new Date().toISOString(),
      opportunities_close_date: new Date().toISOString(),
      opportunities_incremental_bookings: 0,
      opportunities_amount: 0,
      // FIX: Add missing forecast properties required by the Opportunity type.
      opportunities_forecast_category: 'N/A',
      opportunities_services_forecast_sfdc: 0,
      disposition: {
        status: 'Not Reviewed',
        notes: `Initial Contact: ${data.contact}\n\nDescription:\n${data.description}`,
        actionItems: []
      }
    };
    setOpportunities(prev => [newScopingOpp, ...prev]);
    setIsScopingModalOpen(false);
  };

  const renderContent = () => {
    if (isLoading && opportunities.length === 0) {
      return <LoadingSpinner />;
    }

    if (error) {
      return (
        <div className="text-center p-8">
          <h2 className="text-2xl font-bold text-red-600">An Error Occurred</h2>
          <p className="text-slate-600 mt-2">{error}</p>
          <button
            onClick={loadOpportunities}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition"
          >
            Retry
          </button>
        </div>
      );
    }

    if (activeView === 'tasks') {
        return (
            <TaskCockpit 
                tasks={allTasks} 
                onTaskUpdate={handleTaskUpdate}
                onSelectOpportunity={handleSelectOpportunityById}
            />
        );
    }

    if (selectedOpportunity && selectedOpportunityDetails) {
      // Find historical opportunities for the selected account from the main list
      const historicalOpps = opportunities.filter(
        opp => opp.accounts_salesforce_account_id === selectedOpportunity.accounts_salesforce_account_id
      );

      return (
        <OpportunityDetail
          opportunity={selectedOpportunity}
          details={selectedOpportunityDetails}
          historicalOpportunities={historicalOpps}
          onBack={handleGoBack}
          onSave={handleSaveDisposition}
        />
      );
    }

    return (
      <OpportunityList
        opportunities={filteredOpportunities}
        onSelect={handleSelectOpportunity}
        savedFilters={savedFilters}
        onSaveFilter={handleSaveFilter}
        onApplyFilter={handleApplySavedFilter}
        onClearFilters={handleClearFilters}
        onAddScoping={() => setIsScopingModalOpen(true)}
        onOpenFilterBuilder={() => setIsFilterBuilderOpen(true)}
        activeFilterCount={filters.rules.length}
      />
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800">
      <Header activeView={activeView} onNavigate={setActiveView} />
      <main className="container mx-auto p-4 md:p-8">
        {isLoading && opportunities.length > 0 && <div className="fixed top-20 right-4 bg-indigo-600 text-white px-4 py-2 rounded-md shadow-lg animate-pulse">Updating...</div>}
        {renderContent()}
      </main>
      <AddScopingModal 
        isOpen={isScopingModalOpen}
        onClose={() => setIsScopingModalOpen(false)}
        onSave={handleSaveScopingActivity}
      />
      {isFilterBuilderOpen && (
         <AdvancedFilterBuilder
            isOpen={isFilterBuilderOpen}
            onClose={() => setIsFilterBuilderOpen(false)}
            onApply={handleApplyAdvancedFilters}
            initialFilters={filters}
         />
      )}
    </div>
  );
};

export default App;