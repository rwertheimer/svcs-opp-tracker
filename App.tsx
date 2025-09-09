
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Opportunity, AccountDetails, Disposition, FilterCriteria, SavedFilter, TaskWithOpportunityContext, ActionItem } from './types';
import { OpportunityStage } from './types';
import { fetchOpportunities, fetchOpportunityDetails } from './services/apiService';
import OpportunityList from './components/OpportunityList';
import OpportunityDetail from './components/OpportunityDetail';
import Header from './components/Header';
import LoadingSpinner from './components/LoadingSpinner';
import TaskCockpit from './components/TaskCockpit';
import AddScopingModal from './components/AddScopingModal';

const initialFilterCriteria: FilterCriteria = {
  searchTerm: '',
  statuses: [],
  salesReps: [],
  disposition: 'any',
  minDealSize: null,
  maxDealSize: null,
};

const App: React.FC = () => {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [selectedOpportunityDetails, setSelectedOpportunityDetails] = useState<AccountDetails | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterCriteria>(initialFilterCriteria);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [activeView, setActiveView] = useState<'opportunities' | 'tasks'>('opportunities');
  const [isScopingModalOpen, setIsScopingModalOpen] = useState(false);


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
  
  const filteredOpportunities = useMemo(() => {
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);
    const today = new Date();

    // Apply the base filter first as per requirements
    const baseFilteredOpps = opportunities.filter(opp => {
      const allowedTypes = ['Renewal', 'New Business', 'Upsell', 'Expansion'];
      const typeMatch = allowedTypes.includes(opp.opportunities_type);
      const regionMatch = opp.accounts_region_name === 'NA - Enterprise' || opp.accounts_region_name === 'NA - Commercial';
      
      const closeDate = new Date(opp.accounts_subscription_end_date);
      const subscriptionEndDate = new Date(opp.accounts_subscription_end_date);
      const dateMatch = (closeDate <= ninetyDaysFromNow) || (subscriptionEndDate <= ninetyDaysFromNow);

      // Exclude opportunities with "Closed", "Won", or "Lost" in the stage name.
      const stageNameLower = opp.opportunities_stage_name.toLowerCase();
      const stageMatch = !stageNameLower.includes('closed') && !stageNameLower.includes('won') && !stageNameLower.includes('lost');

      return typeMatch && regionMatch && dateMatch && stageMatch;
    });

    // Then apply the user's interactive filters
    return baseFilteredOpps.filter(opp => {
      const searchTermMatch = filters.searchTerm.toLowerCase() === '' ||
        opp.opportunities_name.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        opp.accounts_salesforce_account_name.toLowerCase().includes(filters.searchTerm.toLowerCase());

      const statusMatch = filters.statuses.length === 0 || filters.statuses.includes(opp.opportunities_stage_name as OpportunityStage);
      const salesRepMatch = filters.salesReps.length === 0 || filters.salesReps.includes(opp.opportunities_owner_name);

      const minDealSizeMatch = filters.minDealSize === null || opp.opportunities_amount >= filters.minDealSize;
      const maxDealSizeMatch = filters.maxDealSize === null || opp.opportunities_amount <= filters.maxDealSize;
      
      const dispositionMatch =
        filters.disposition === 'any' ||
        (filters.disposition === 'not-reviewed' && (!opp.disposition || opp.disposition.status === 'Not Reviewed')) ||
        (filters.disposition === 'services-fit' && opp.disposition?.status === 'Services Fit') ||
        (filters.disposition === 'no-services-opp' && opp.disposition?.status === 'No Services Opp') ||
        (filters.disposition === 'watchlist' && opp.disposition?.status === 'Watchlist');

      return searchTermMatch && statusMatch && salesRepMatch && minDealSizeMatch && maxDealSizeMatch && dispositionMatch;
    });
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

    setOpportunities(prevOpps =>
      prevOpps.map(opp => {
        if (opp.opportunities_id === selectedOpportunity.opportunities_id) {
          return { ...opp, disposition };
        }
        return opp;
      })
    );
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

  const handleFilterChange = (newFilters: Partial<FilterCriteria>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  const handleSaveFilter = (name: string) => {
    if (!name.trim()) return;
    const newSavedFilter: SavedFilter = {
        id: Date.now().toString(),
        name,
        criteria: { ...filters }
    };
    setSavedFilters(prev => [...prev, newSavedFilter]);
  };

  const handleApplyFilter = (id: string) => {
    const savedFilter = savedFilters.find(f => f.id === id);
    if (savedFilter) {
        setFilters(savedFilter.criteria);
    }
  };

  const handleClearFilters = () => {
    setFilters(initialFilterCriteria);
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
      opportunities_incremental_bookings: 0,
      opportunities_amount: 0,
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
        allOpportunities={opportunities}
        onSelect={handleSelectOpportunity}
        filters={filters}
        onFilterChange={handleFilterChange}
        savedFilters={savedFilters}
        onSaveFilter={handleSaveFilter}
        onApplyFilter={handleApplyFilter}
        onClearFilters={handleClearFilters}
        onAddScoping={() => setIsScopingModalOpen(true)}
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
    </div>
  );
};

export default App;
