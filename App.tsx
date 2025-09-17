

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Opportunity, AccountDetails, Disposition, SavedFilter, TaskWithOpportunityContext, ActionItem, FilterGroup, User } from './types';
import { fetchOpportunities, fetchOpportunityDetails, saveDisposition, fetchUsers, createActionItem, updateActionItem, deleteActionItem } from './services/apiService';
import OpportunityList from './components/OpportunityList';
import OpportunityDetail from './components/OpportunityDetail';
import Header from './components/Header';
import LoadingSpinner from './components/LoadingSpinner';
import TaskCockpit from './components/TaskCockpit';
import AddScopingModal from './components/AddScopingModal';
import AdvancedFilterBuilder from './components/AdvancedFilterBuilder';
import SalesOrgChart from './components/SalesOrgChart';

const initialFilterGroup: FilterGroup = {
    id: 'root',
    combinator: 'AND',
    rules: [],
};

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
  const [isOrgChartModalOpen, setIsOrgChartModalOpen] = useState(false);
  
  // --- NEW: User Management State ---
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // --- NEW: Debugging/View State ---
  const [showAllOpportunities, setShowAllOpportunities] = useState(false);


  const loadInitialData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Fetch users first to establish context
      const fetchedUsers = await fetchUsers();
      setUsers(fetchedUsers);
      if (fetchedUsers.length > 0) {
        setCurrentUser(fetchedUsers[0]);
      }
      
      const fetchedOpportunities = await fetchOpportunities();
      setOpportunities(fetchedOpportunities);
    } catch (err: any) {
      setError('Failed to fetch initial data. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);
  
  const evaluateFilterGroup = (opp: Opportunity, group: FilterGroup): boolean => {
    const results = group.rules.map(rule => {
      if ('combinator' in rule) {
        return evaluateFilterGroup(opp, rule);
      } else {
        const value = getNestedValue(opp, rule.field);
        if (value === null || value === undefined) return false;
        
        const ruleValue = rule.value;
        const oppValue = value;

        switch (rule.operator) {
          case 'contains': return oppValue.toString().toLowerCase().includes(ruleValue.toString().toLowerCase());
          case 'not_contains': return !oppValue.toString().toLowerCase().includes(ruleValue.toString().toLowerCase());
          case 'equals': return oppValue.toString().toLowerCase() === ruleValue.toString().toLowerCase();
          case 'not_equals': return oppValue.toString().toLowerCase() !== ruleValue.toString().toLowerCase();
          case 'eq': return Number(oppValue) === Number(ruleValue);
          case 'neq': return Number(oppValue) !== Number(ruleValue);
          case 'gt': return Number(oppValue) > Number(ruleValue);
          case 'gte': return Number(oppValue) >= Number(ruleValue);
          case 'lt': return Number(oppValue) < Number(ruleValue);
          case 'lte': return Number(oppValue) <= Number(ruleValue);
          case 'on': return new Date(oppValue as string).toDateString() === new Date(ruleValue).toDateString();
          case 'before': return new Date(oppValue as string) < new Date(ruleValue);
          case 'after': return new Date(oppValue as string) > new Date(ruleValue);
          case 'is': 
              if (typeof oppValue === 'string' && typeof ruleValue === 'string') return oppValue.toLowerCase() === ruleValue.toLowerCase();
              return oppValue === ruleValue;
          case 'is_not': 
              if (typeof oppValue === 'string' && typeof ruleValue === 'string') return oppValue.toLowerCase() !== ruleValue.toLowerCase();
              return oppValue !== ruleValue;
          default: return false;
        }
      }
    });
    return group.combinator === 'AND' ? results.every(res => res) : results.some(res => res);
  };

  const filteredOpportunities = useMemo(() => {
    const oneHundredTwentyDaysFromNow = new Date();
    oneHundredTwentyDaysFromNow.setDate(oneHundredTwentyDaysFromNow.getDate() + 120);

    const baseFilteredOpps = opportunities.filter(opp => {
      const allowedTypes = ['Renewal', 'New Business', 'Upsell', 'Expansion'];
      const typeMatch = allowedTypes.includes(opp.opportunities_type);
      const regionMatch = opp.accounts_region_name === 'NA - Enterprise' || opp.accounts_region_name === 'NA - Commercial';
      const stageNameLower = opp.opportunities_stage_name.toLowerCase();
      const stageMatch = !stageNameLower.includes('closed') && !stageNameLower.includes('won') && !stageNameLower.includes('lost');

      if (!typeMatch || !regionMatch || !stageMatch) return false;

      // The toggle bypasses the 120-day date filter.
      if (showAllOpportunities) {
          return true;
      }
      
      const closeDate = new Date(opp.opportunities_close_date);
      const subscriptionEndDate = new Date(opp.accounts_subscription_end_date);
      const dateMatch = (closeDate <= oneHundredTwentyDaysFromNow) || (subscriptionEndDate <= oneHundredTwentyDaysFromNow);
      
      // The base filter no longer considers disposition status. Users can filter this manually.
      return dateMatch;
    });

    if (filters.rules.length === 0) return baseFilteredOpps;
    return baseFilteredOpps.filter(opp => evaluateFilterGroup(opp, filters));
  }, [opportunities, filters, showAllOpportunities]);
  
  const allTasksForCurrentUser = useMemo((): TaskWithOpportunityContext[] => {
    if (!currentUser) return [];
    return opportunities.flatMap(opp => 
      (opp.actionItems ?? [])
        .filter(item => item.assigned_to_user_id === currentUser.user_id)
        .map(item => ({
            ...item,
            opportunityId: opp.opportunities_id,
            opportunityName: opp.opportunities_name,
            accountName: opp.accounts_salesforce_account_name,
        }))
    );
  }, [opportunities, currentUser]);

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
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSelectOpportunityById = (opportunityId: string) => {
    const opportunity = opportunities.find(opp => opp.opportunities_id === opportunityId);
    if (opportunity) handleSelectOpportunity(opportunity);
  };

  const handleGoBack = () => {
    setSelectedOpportunity(null);
    setSelectedOpportunityDetails(null);
  };
  
  const handleSaveDisposition = async (disposition: Disposition) => {
    if (!selectedOpportunity || !currentUser) return;

    const originalOpportunity = opportunities.find(opp => opp.opportunities_id === selectedOpportunity.opportunities_id);
    if (!originalOpportunity) return;

    const updatedOpportunity = { ...originalOpportunity, disposition: { ...disposition, last_updated_by_user_id: currentUser.user_id }};
    
    setOpportunities(prevOpps => prevOpps.map(opp => opp.opportunities_id === updatedOpportunity.opportunities_id ? updatedOpportunity : opp));
    handleGoBack();

    try {
      const savedDisposition = await saveDisposition(updatedOpportunity.opportunities_id, updatedOpportunity.disposition, currentUser.user_id);
      // On success, update the opportunity with the new version from the server
      setOpportunities(prevOpps => prevOpps.map(opp => opp.opportunities_id === updatedOpportunity.opportunities_id ? { ...updatedOpportunity, disposition: savedDisposition } : opp));
    } catch (err: any) {
        // FIX: Check for error status code 409 for optimistic locking conflicts.
        if (err.status === 409) { // Optimistic locking conflict
            alert("Conflict: This opportunity was updated by another user. Your changes could not be saved. The view will now refresh.");
            window.location.reload(); // Force a refresh to get the latest data
        } else {
            console.error("Failed to save disposition:", err);
            setError(`Failed to save disposition for ${originalOpportunity.opportunities_name}. Your changes have been reverted.`);
            setOpportunities(prevOpps => prevOpps.map(opp => opp.opportunities_id === originalOpportunity.opportunities_id ? originalOpportunity : opp));
        }
    }
  };
  
  // --- NEW: Action Item Handlers ---
  const handleActionItemCreate = async (opportunityId: string, actionItem: Omit<ActionItem, 'action_item_id' | 'created_by_user_id'>) => {
      if (!currentUser) return;
      
      // Optimistic update
      const tempId = `temp-${Date.now()}`;
      const newItem: ActionItem = {
          ...actionItem,
          action_item_id: tempId,
          created_by_user_id: currentUser.user_id
      };
      setOpportunities(prev => prev.map(opp => opp.opportunities_id === opportunityId ? {...opp, actionItems: [...(opp.actionItems || []), newItem]} : opp));

      try {
          const savedItem = await createActionItem(opportunityId, newItem);
          // Replace temp item with saved item from server
          setOpportunities(prev => prev.map(opp => opp.opportunities_id === opportunityId 
              ? {...opp, actionItems: (opp.actionItems || []).map(item => item.action_item_id === tempId ? savedItem : item)} 
              : opp
          ));
      } catch (error) {
          console.error("Failed to create action item:", error);
          setError("Failed to save new action item. Reverting change.");
          // Revert optimistic update
          setOpportunities(prev => prev.map(opp => opp.opportunities_id === opportunityId 
              ? {...opp, actionItems: (opp.actionItems || []).filter(item => item.action_item_id !== tempId)} 
              : opp
          ));
      }
  };

  const handleActionItemUpdate = async (opportunityId: string, actionItemId: string, updates: Partial<ActionItem>) => {
      const originalOpps = [...opportunities];
      // Optimistic update
      setOpportunities(prev => prev.map(opp => {
          if (opp.opportunities_id === opportunityId) {
              return {...opp, actionItems: (opp.actionItems || []).map(item => item.action_item_id === actionItemId ? {...item, ...updates} : item)};
          }
          return opp;
      }));
      
      try {
          await updateActionItem(actionItemId, updates);
      } catch (error) {
          console.error("Failed to update action item:", error);
          setError("Failed to update action item. Reverting change.");
          setOpportunities(originalOpps);
      }
  };

  const handleActionItemDelete = async (opportunityId: string, actionItemId: string) => {
      const originalOpps = [...opportunities];
      // Optimistic update
      setOpportunities(prev => prev.map(opp => opp.opportunities_id === opportunityId 
          ? {...opp, actionItems: (opp.actionItems || []).filter(item => item.action_item_id !== actionItemId)} 
          : opp
      ));

      try {
          await deleteActionItem(actionItemId);
      } catch (error) {
          console.error("Failed to delete action item:", error);
          setError("Failed to delete action item. Reverting change.");
          setOpportunities(originalOpps);
      }
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
    if (savedFilter) setFilters(savedFilter.criteria);
  };

  const handleClearFilters = () => setFilters(initialFilterGroup);
  
  const handleSaveScopingActivity = (data: { accountName: string; contact: string; description: string; }) => {
    const newScopingOpp: Opportunity = {
      opportunities_id: `scoping-${Date.now()}`,
      opportunities_name: `Scoping: ${data.description.substring(0, 30)}...`,
      opportunities_subscription_start_date: new Date().toISOString(),
      opportunities_stage_name: 'Pre-Sales Scoping',
      opportunities_owner_name: currentUser?.name ?? 'N/A',
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
      opportunities_forecast_category: 'N/A',
      opportunities_services_forecast_sfdc: 0,
      actionItems: [],
      disposition: {
        status: 'Not Reviewed',
        notes: `Initial Contact: ${data.contact}\n\nDescription:\n${data.description}`,
        version: 1,
        last_updated_by_user_id: currentUser?.user_id ?? ''
      }
    };
    setOpportunities(prev => [newScopingOpp, ...prev]);
    setIsScopingModalOpen(false);
  };

  const renderContent = () => {
    if (!currentUser && isLoading) {
      return <LoadingSpinner />;
    }

    if (error) {
      return (
        <div className="text-center p-8">
          <h2 className="text-2xl font-bold text-red-600">An Error Occurred</h2>
          <p className="text-slate-600 mt-2">{error}</p>
          <button onClick={loadInitialData} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Retry</button>
        </div>
      );
    }

    if (activeView === 'tasks') {
        return (
            <TaskCockpit 
                tasks={allTasksForCurrentUser} 
                onTaskUpdate={(taskId, oppId, updates) => handleActionItemUpdate(oppId, taskId, updates)}
                onSelectOpportunity={handleSelectOpportunityById}
                users={users}
                currentUser={currentUser!}
            />
        );
    }

    if (selectedOpportunity && selectedOpportunityDetails) {
      const historicalOpps = opportunities.filter(opp => opp.accounts_salesforce_account_id === selectedOpportunity.accounts_salesforce_account_id);

      return (
        <OpportunityDetail
          opportunity={selectedOpportunity}
          details={selectedOpportunityDetails}
          historicalOpportunities={historicalOpps}
          onBack={handleGoBack}
          onSave={handleSaveDisposition}
          users={users}
          currentUser={currentUser!}
          onActionItemCreate={handleActionItemCreate}
          onActionItemUpdate={handleActionItemUpdate}
          onActionItemDelete={handleActionItemDelete}
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
        onOpenOrgChart={() => setIsOrgChartModalOpen(true)}
        activeFilterCount={filters.rules.length}
        showAllOpportunities={showAllOpportunities}
        onToggleShowAll={setShowAllOpportunities}
      />
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800">
      <Header 
        activeView={activeView} 
        onNavigate={setActiveView} 
        users={users}
        currentUser={currentUser}
        onSwitchUser={setCurrentUser}
      />
      <main className="container mx-auto p-4 md:p-8">
        {isLoading && opportunities.length > 0 && <div className="fixed top-20 right-4 bg-indigo-600 text-white px-4 py-2 rounded-md shadow-lg animate-pulse">Updating...</div>}
        {renderContent()}
      </main>
      <AddScopingModal 
        isOpen={isScopingModalOpen}
        onClose={() => setIsScopingModalOpen(false)}
        onSave={handleSaveScopingActivity}
      />
      <SalesOrgChart
        isOpen={isOrgChartModalOpen}
        onClose={() => setIsOrgChartModalOpen(false)}
        opportunities={opportunities}
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