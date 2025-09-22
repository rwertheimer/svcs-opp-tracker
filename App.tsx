

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Opportunity, AccountDetails, Disposition, SavedFilter, TaskWithOpportunityContext, ActionItem, FilterGroup, User, FilterRule } from './types';
import { fetchOpportunities, fetchOpportunityDetails, saveDisposition, fetchUsers, createActionItem, updateActionItem, deleteActionItem, fetchSavedViews, createSavedView, updateSavedView, deleteSavedView as deleteSavedViewApi, setDefaultSavedView } from './services/apiService';
import OpportunityList from './components/OpportunityList';
import OpportunityDetail from './components/OpportunityDetail';
import Header from './components/Header';
import LoadingSpinner from './components/LoadingSpinner';
import TaskCockpit from './components/TaskCockpit';
import AddScopingModal from './components/AddScopingModal';
import AdvancedFilterBuilder from './components/AdvancedFilterBuilder';
import SalesOrgChart from './components/SalesOrgChart';
import { useToast } from './components/Toast';
import { ICONS } from './constants';

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
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [searchResetToken, setSearchResetToken] = useState(0);
  const [isManageViewsOpen, setIsManageViewsOpen] = useState(false);
  const [activeView, setActiveView] = useState<'opportunities' | 'tasks'>('opportunities');
  const [isScopingModalOpen, setIsScopingModalOpen] = useState(false);
  const [isFilterBuilderOpen, setIsFilterBuilderOpen] = useState(false);
  const [isOrgChartModalOpen, setIsOrgChartModalOpen] = useState(false);
  const [detailInitialSection, setDetailInitialSection] = useState<string | undefined>(undefined);
  // Internal: prime Advanced Filter Builder with org-chart selections
  const [pendingOrgFilters, setPendingOrgFilters] = useState<FilterGroup | null>(null);
  const USE_SAVED_VIEWS_API = import.meta.env?.VITE_SAVED_VIEWS_API === 'true';
  
  // --- NEW: User Management State ---
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const { showToast } = useToast();
  
  // --- NEW: Debugging/View State ---


  const loadInitialData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      // Fetch users and opportunities in parallel to reduce total load time
      const [fetchedUsers, fetchedOpportunities] = await Promise.all([
        fetchUsers(),
        fetchOpportunities(),
      ]);
      setUsers(fetchedUsers);
      if (fetchedUsers.length > 0) {
        const storedUserId = (() => {
          try { return localStorage.getItem('currentUserId') || undefined; } catch { return undefined; }
        })();
        const preferred = storedUserId ? fetchedUsers.find(u => u.user_id === storedUserId) : undefined;
        setCurrentUser(preferred ?? fetchedUsers[0]);
      }
      setOpportunities(fetchedOpportunities);
    } catch (err: any) {
      setError('Failed to fetch initial data. Please try again.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // --- Saved Views hydration ---
  useEffect(() => {
    if (USE_SAVED_VIEWS_API) return; // handled by API effect below
    try {
      const raw = localStorage.getItem('savedFilters');
      if (raw) {
        const parsed: SavedFilter[] = JSON.parse(raw);
        setSavedFilters(parsed);
        const defaultView = parsed.find(v => v.isDefault);
        if (defaultView) {
          setFilters(defaultView.criteria);
          setActiveViewId(defaultView.id);
        }
      }
    } catch {}
  }, [USE_SAVED_VIEWS_API]);

  useEffect(() => {
    if (USE_SAVED_VIEWS_API) return; // don't write when using API
    try {
      localStorage.setItem('savedFilters', JSON.stringify(savedFilters));
    } catch {}
  }, [savedFilters, USE_SAVED_VIEWS_API]);

  // API-backed saved views hydration
  const [savedViewsApiOnline, setSavedViewsApiOnline] = useState(true);
  const refreshSavedViews = useCallback(async (uid: string) => {
    const list = await fetchSavedViews(uid);
    setSavedFilters(list);
    setSavedViewsApiOnline(true);
    return list;
  }, []);

  useEffect(() => {
    const uid = currentUser?.user_id;
    if (!USE_SAVED_VIEWS_API || !uid) return;
    (async () => {
      try {
        const list = await refreshSavedViews(uid);
        const def = list.find(v => v.isDefault);
        if (def) {
          setFilters(def.criteria);
          setActiveViewId(def.id);
        }
      } catch (e) {
        setSavedViewsApiOnline(false);
        showToast('Failed to load saved views. Please try again.', 'error');
      }
    })();
  }, [USE_SAVED_VIEWS_API, currentUser?.user_id, refreshSavedViews]);

  // Stable deep equality that ignores object key order
  const deepEqual = (a: any, b: any) => {
    const stable = (val: any): any => {
      if (Array.isArray(val)) return val.map(stable);
      if (val && typeof val === 'object') {
        const sortedKeys = Object.keys(val).sort();
        const out: any = {};
        for (const k of sortedKeys) out[k] = stable(val[k]);
        return out;
      }
      return val;
    };
    try {
      return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
    } catch {
      return false;
    }
  };
  const hasOrgGroup = (fg: FilterGroup): boolean => {
    const stack: (FilterGroup | FilterRule)[] = [fg as any];
    while (stack.length) {
      const node = stack.pop()!;
      if ('combinator' in node) {
        if (node.id?.toString().startsWith('org-')) return true;
        stack.push(...node.rules);
      }
    }
    return false;
  };

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);
  
  // Persist the selected user so API-backed Saved Views load consistently across reloads
  useEffect(() => {
    if (currentUser?.user_id) {
      try { localStorage.setItem('currentUserId', currentUser.user_id); } catch {}
    }
  }, [currentUser?.user_id]);
  
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
      // This is a permanent base filter, which is a sensible default for a pipeline view.
      const stageNameLower = (opp.opportunities_stage_name || '').toLowerCase();
      const isClosed = stageNameLower.includes('closed') || stageNameLower.includes('won') || stageNameLower.includes('lost');
      if (isClosed) {
        return false;
      }

      // If toggle is OFF, apply the more restrictive default filters
      // Be tolerant of common type variants by doing a contains match
      const typeLower = (opp.opportunities_type || '').toLowerCase();
      const typeMatch = ['renewal', 'new', 'upsell', 'expansion'].some(k => typeLower.includes(k));
      
      const regionMatch = opp.accounts_region_name === 'NA - Enterprise' || opp.accounts_region_name === 'NA - Commercial';
      
      const closeDate = new Date(opp.opportunities_close_date);
      const subscriptionEndDate = new Date(opp.accounts_subscription_end_date);
      const dateMatch = (closeDate <= oneHundredTwentyDaysFromNow) || (subscriptionEndDate <= oneHundredTwentyDaysFromNow);
      
      return typeMatch && regionMatch && dateMatch;
    });

    if (filters.rules.length === 0) return baseFilteredOpps;
    return baseFilteredOpps.filter(opp => evaluateFilterGroup(opp, filters));
  }, [opportunities, filters]);
  
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
    setDetailInitialSection(undefined); // default when coming from list
    // Clear hash to avoid unintended scroll targets
    try { window.history.replaceState(null, '', window.location.pathname); } catch {}
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
    if (opportunity) {
      // Navigate directly to the Disposition/Action Plan area
      setDetailInitialSection('disposition');
      try { window.location.hash = '#disposition'; } catch {}
      handleSelectOpportunity(opportunity);
    }
  };

  const handleGoBack = () => {
    setSelectedOpportunity(null);
    setSelectedOpportunityDetails(null);
  };
  
  const handleSaveDisposition = async (disposition: Disposition) => {
    if (!selectedOpportunity || !currentUser) return;

    const originalOpportunity = opportunities.find(opp => opp.opportunities_id === selectedOpportunity.opportunities_id);
    if (!originalOpportunity) return;

    const updatedOpportunity = {
      ...originalOpportunity,
      disposition: { ...disposition, documents: disposition.documents ?? [], last_updated_by_user_id: currentUser.user_id }
    };
    
    // Optimistically update local state and keep user on the detail view
    setOpportunities(prevOpps => prevOpps.map(opp => opp.opportunities_id === updatedOpportunity.opportunities_id ? updatedOpportunity : opp));
    setSelectedOpportunity(updatedOpportunity);
    showToast('Saving disposition...', 'info', 1500);

    try {
      const savedDisposition = await saveDisposition(updatedOpportunity.opportunities_id, updatedOpportunity.disposition, currentUser.user_id);
      // On success, update the opportunity with the new version from the server
      const merged = { ...updatedOpportunity, disposition: savedDisposition };
      setOpportunities(prevOpps => prevOpps.map(opp => opp.opportunities_id === updatedOpportunity.opportunities_id ? merged : opp));
      setSelectedOpportunity(merged);
      showToast('Disposition saved', 'success');
    } catch (err: any) {
        // FIX: Check for error status code 409 for optimistic locking conflicts.
        if (err.status === 409) { // Optimistic locking conflict
            showToast('Save conflict: another user updated this item', 'error');
            alert("Conflict: This opportunity was updated by another user. Your changes could not be saved. The view will now refresh.");
            window.location.reload(); // Force a refresh to get the latest data
        } else {
            console.error("Failed to save disposition:", err);
            setError(`Failed to save disposition for ${originalOpportunity.opportunities_name}. Your changes have been reverted.`);
            setOpportunities(prevOpps => prevOpps.map(opp => opp.opportunities_id === originalOpportunity.opportunities_id ? originalOpportunity : opp));
            showToast('Failed to save disposition', 'error');
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
      // Keep selectedOpportunity in sync so UI updates immediately
      setSelectedOpportunity(prev => prev && prev.opportunities_id === opportunityId 
        ? { ...prev, actionItems: [...(prev.actionItems || []), newItem] } 
        : prev);

      try {
          const savedItem = await createActionItem(opportunityId, newItem);
          // Replace temp item with saved item from server
          setOpportunities(prev => prev.map(opp => opp.opportunities_id === opportunityId 
              ? {...opp, actionItems: (opp.actionItems || []).map(item => item.action_item_id === tempId ? savedItem : item)} 
              : opp
          ));
          setSelectedOpportunity(prev => prev && prev.opportunities_id === opportunityId 
            ? { ...prev, actionItems: (prev.actionItems || []).map(item => item.action_item_id === tempId ? savedItem : item) } 
            : prev);
      } catch (error) {
          console.error("Failed to create action item:", error);
          setError("Failed to save new action item. Reverting change.");
          // Revert optimistic update
          setOpportunities(prev => prev.map(opp => opp.opportunities_id === opportunityId 
              ? {...opp, actionItems: (opp.actionItems || []).filter(item => item.action_item_id !== tempId)} 
              : opp
          ));
          setSelectedOpportunity(prev => prev && prev.opportunities_id === opportunityId 
            ? { ...prev, actionItems: (prev.actionItems || []).filter(item => item.action_item_id !== tempId) } 
            : prev);
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
      setSelectedOpportunity(prev => prev && prev.opportunities_id === opportunityId 
        ? { ...prev, actionItems: (prev.actionItems || []).map(item => item.action_item_id === actionItemId ? { ...item, ...updates } : item) }
        : prev);
      
      try {
          await updateActionItem(actionItemId, updates);
      } catch (error) {
          console.error("Failed to update action item:", error);
          setError("Failed to update action item. Reverting change.");
          setOpportunities(originalOpps);
          // Re-sync selectedOpportunity from originalOpps
          const orig = originalOpps.find(o => o.opportunities_id === opportunityId);
          setSelectedOpportunity(prev => prev && prev.opportunities_id === opportunityId && orig ? orig : prev);
      }
  };

  const handleActionItemDelete = async (opportunityId: string, actionItemId: string) => {
      const originalOpps = [...opportunities];
      // Optimistic update
      setOpportunities(prev => prev.map(opp => opp.opportunities_id === opportunityId 
          ? {...opp, actionItems: (opp.actionItems || []).filter(item => item.action_item_id !== actionItemId)} 
          : opp
      ));
      setSelectedOpportunity(prev => prev && prev.opportunities_id === opportunityId 
        ? { ...prev, actionItems: (prev.actionItems || []).filter(item => item.action_item_id !== actionItemId) }
        : prev);

      try {
          await deleteActionItem(actionItemId);
      } catch (error) {
          console.error("Failed to delete action item:", error);
          setError("Failed to delete action item. Reverting change.");
          setOpportunities(originalOpps);
          const orig = originalOpps.find(o => o.opportunities_id === opportunityId);
          setSelectedOpportunity(prev => prev && prev.opportunities_id === opportunityId && orig ? orig : prev);
      }
  };


  const handleApplyAdvancedFilters = (newFilters: FilterGroup) => {
    setFilters(newFilters);
    setIsFilterBuilderOpen(false);
  }

  const handleSaveFilter = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const dupe = savedFilters.find(v => v.name.toLowerCase() === trimmed.toLowerCase());
    const origin: SavedFilter['origin'] = hasOrgGroup(filters) ? 'orgChart' : 'manual';
    if (dupe) {
      const replace = window.confirm(`A view named "${trimmed}" already exists.\nClick OK to replace it, or Cancel to save as a new name.`);
      if (replace) {
        if (USE_SAVED_VIEWS_API && currentUser) {
          updateSavedView(currentUser.user_id, dupe.id, { name: trimmed, criteria: filters, origin })
            .then(() => refreshSavedViews(currentUser.user_id))
            .catch(() => showToast('Failed to save view.', 'error'));
        } else {
          setSavedFilters(prev => prev.map(v => v.id === dupe.id ? { ...v, name: trimmed, criteria: filters, updatedAt: now, origin } : v));
        }
        setActiveViewId(dupe.id);
        return;
      }
      const newName = window.prompt('Enter a new name for this view:', `${trimmed} (copy)`);
      if (!newName || !newName.trim()) return;
      const finalName = newName.trim();
      if (savedFilters.some(v => v.name.toLowerCase() === finalName.toLowerCase())) {
        alert('A view with that name already exists. Please choose a different name.');
        return;
      }
      if (USE_SAVED_VIEWS_API && currentUser) {
        createSavedView(currentUser.user_id, { name: finalName, criteria: filters, origin })
          .then(v => { setActiveViewId(v.id); return refreshSavedViews(currentUser.user_id); })
          .catch(() => showToast('Failed to save view.', 'error'));
      } else {
        const newView: SavedFilter = { id: Date.now().toString(), name: finalName, criteria: filters, createdAt: now, updatedAt: now, origin };
        setSavedFilters(prev => [...prev, newView]);
        setActiveViewId(newView.id);
      }
      return;
    }
    if (USE_SAVED_VIEWS_API && currentUser) {
      createSavedView(currentUser.user_id, { name: trimmed, criteria: filters, origin })
        .then(v => { setActiveViewId(v.id); return refreshSavedViews(currentUser.user_id); })
        .catch(() => showToast('Failed to save view.', 'error'));
    } else {
      const newView: SavedFilter = { id: Date.now().toString(), name: trimmed, criteria: filters, createdAt: now, updatedAt: now, origin };
      setSavedFilters(prev => [...prev, newView]);
      setActiveViewId(newView.id);
    }
  };

  const handleApplySavedFilter = (id: string) => {
    const savedFilter = savedFilters.find(f => f.id === id);
    if (savedFilter) {
      setFilters(savedFilter.criteria);
      setActiveViewId(id);
      setSearchResetToken(prev => prev + 1);
    }
  };

  const handleClearFilters = () => {
    setFilters(initialFilterGroup);
    setActiveViewId(null);
    setSearchResetToken(prev => prev + 1);
  };

  const handleRenameSavedFilter = (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (savedFilters.some(v => v.id !== id && v.name.toLowerCase() === trimmed.toLowerCase())) {
      alert('A view with that name already exists.');
      return;
    }
    if (USE_SAVED_VIEWS_API && currentUser) {
      updateSavedView(currentUser.user_id, id, { name: trimmed })
        .then(() => refreshSavedViews(currentUser.user_id))
        .catch(() => showToast('Failed to rename view.', 'error'));
    } else {
      setSavedFilters(prev => prev.map(v => v.id === id ? { ...v, name: trimmed, updatedAt: new Date().toISOString() } : v));
    }
  };

  const handleDeleteSavedFilter = (id: string) => {
    const view = savedFilters.find(v => v.id === id);
    if (!view) return;
    if (!window.confirm(`Delete saved view "${view.name}"?`)) return;
    if (USE_SAVED_VIEWS_API && currentUser) {
      deleteSavedViewApi(currentUser.user_id, id)
        .then(() => refreshSavedViews(currentUser.user_id))
        .catch(() => showToast('Failed to delete view.', 'error'));
    } else {
      setSavedFilters(prev => prev.filter(v => v.id !== id));
    }
    if (activeViewId === id) { setActiveViewId(null); }
  };

  const handleSetDefaultView = (id: string) => {
    if (USE_SAVED_VIEWS_API && currentUser) {
      setDefaultSavedView(currentUser.user_id, id)
        .then(() => refreshSavedViews(currentUser.user_id))
        .catch(() => showToast('Failed to set default view.', 'error'));
    } else {
      setSavedFilters(prev => prev.map(v => ({ ...v, isDefault: v.id === id })));
    }
  };
  
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
        last_updated_by_user_id: currentUser?.user_id ?? '',
        documents: [],
      }
    };
    setOpportunities(prev => [newScopingOpp, ...prev]);
    setIsScopingModalOpen(false);
  };

  // --- Unsaved changes banner for active saved view ---
  const activeSavedView = useMemo(() => savedFilters.find(v => v.id === activeViewId) || null, [savedFilters, activeViewId]);
  const isDirty = useMemo(() => {
    if (!activeSavedView) return false;
    return !deepEqual(activeSavedView.criteria, filters);
  }, [activeSavedView, filters]);

  const handleSaveChangesToActiveView = () => {
    if (!activeSavedView) return;
    const now = new Date().toISOString();
    setSavedFilters(prev => prev.map(v => v.id === activeSavedView.id ? { ...v, criteria: filters, updatedAt: now } : v));
  };

  const handleSaveAsFromBanner = () => {
    const name = window.prompt('Save current filters as a new view. Enter name:');
    if (name) handleSaveFilter(name);
  };

  const handleRevertActiveView = () => {
    if (!activeSavedView) return;
    setFilters(activeSavedView.criteria);
    setSearchResetToken(prev => prev + 1);
  };

  const renderContent = () => {
    // Show full-page spinner when initial dataset is loading
    if (isLoading && opportunities.length === 0) {
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

    // While loading details for a selected opportunity, show spinner instead of list flicker
    if (activeView === 'opportunities' && selectedOpportunity && isLoading && !selectedOpportunityDetails) {
      return <LoadingSpinner />;
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
          initialSectionId={detailInitialSection}
        />
      );
    }

    return (
      <>
        {activeSavedView && isDirty && (
          <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md flex items-center justify-between">
            <div className="text-sm text-yellow-800 flex items-center space-x-2">
              <span>{ICONS.warning}</span>
              <span>
                Unsaved changes to view
                <span className="font-semibold"> {activeSavedView.name}</span>
              </span>
            </div>
            <div className="space-x-2">
              <button onClick={() => setIsFilterBuilderOpen(true)} className="px-3 py-1 text-xs bg-white border border-slate-300 rounded hover:bg-slate-100">Open Builder</button>
              <button onClick={handleRevertActiveView} className="px-3 py-1 text-xs bg-white border border-slate-300 rounded hover:bg-slate-100">Revert</button>
              <button onClick={handleSaveAsFromBanner} className="px-3 py-1 text-xs bg-white border border-slate-300 rounded hover:bg-slate-100">Save As…</button>
              <button onClick={handleSaveChangesToActiveView} className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">Save Changes</button>
            </div>
          </div>
        )}
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
          onOpenManageSavedViews={() => setIsManageViewsOpen(true)}
          apiModeInfo={USE_SAVED_VIEWS_API ? (savedViewsApiOnline ? `API • ${currentUser?.email ?? (currentUser?.user_id || '').slice(0,8)}` : 'API • offline') : 'Local'}
          searchResetToken={searchResetToken}
        />
      </>
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
        onClose={(selected) => {
          setIsOrgChartModalOpen(false);
          if (selected && (selected.owners.length > 0 || selected.managers.length > 0)) {
            // Build an OR subgroup combining owners and managers equals rules
            const rules: any[] = [];
            selected.owners.forEach(owner => {
              rules.push({ id: `rule-owner-${owner}`, field: 'opportunities_owner_name', operator: 'equals', value: owner });
            });
            selected.managers.forEach(manager => {
              rules.push({ id: `rule-mgr-${manager}`, field: 'opportunities_manager_of_opp_email', operator: 'equals', value: manager });
            });
            const orgGroup: FilterGroup = { id: `org-${Date.now()}`, combinator: 'OR', rules } as any;
            const merged: FilterGroup = {
              id: filters.id,
              combinator: filters.combinator,
              rules: [...filters.rules, orgGroup],
            };
            // Prime builder with merged filters and open it for review
            setPendingOrgFilters(merged);
            setIsFilterBuilderOpen(true);
          }
        }}
        opportunities={opportunities}
      />
      {isFilterBuilderOpen && (
         <AdvancedFilterBuilder
            isOpen={isFilterBuilderOpen}
            onClose={() => setIsFilterBuilderOpen(false)}
            onApply={(fg) => {
              handleApplyAdvancedFilters(fg);
              setPendingOrgFilters(null);
            }}
            initialFilters={pendingOrgFilters ?? filters}
         />
      )}

      {isManageViewsOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-start justify-center pt-16" onClick={() => setIsManageViewsOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-xl m-4 animate-fade-in-up" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">Manage Saved Views</h3>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setIsManageViewsOpen(false)}>{ICONS.xMark}</button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
              {savedFilters.length === 0 && <p className="text-slate-500 text-sm">No saved views yet.</p>}
              {savedFilters.map(v => (
                <div key={v.id} className="flex items-center justify-between border rounded-md p-2">
                  <div>
                    <div className="font-semibold text-slate-800 flex items-center space-x-2">
                      <span>{v.name}</span>
                      {v.origin === 'orgChart' && <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">Org Chart</span>}
                      {v.isDefault && <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md bg-green-50 text-green-700 border border-green-200">Default</span>}
                    </div>
                    <div className="text-xs text-slate-500">Updated {new Date(v.updatedAt || v.createdAt || '').toLocaleString()}</div>
                  </div>
                  <div className="space-x-2">
                    <button className="px-2 py-1 text-xs bg-white border border-slate-300 rounded hover:bg-slate-100" onClick={() => { handleApplySavedFilter(v.id); setIsManageViewsOpen(false); }}>Apply</button>
                    <button className="px-2 py-1 text-xs bg-white border border-slate-300 rounded hover:bg-slate-100" onClick={() => { const nn = prompt('Rename view', v.name); if (nn !== null) handleRenameSavedFilter(v.id, nn); }}>Rename</button>
                    <button className="px-2 py-1 text-xs bg-white border border-slate-300 rounded hover:bg-slate-100" onClick={() => handleSetDefaultView(v.id)}>Set Default</button>
                    <button className="px-2 py-1 text-xs bg-white border border-slate-300 rounded hover:bg-red-50 text-red-600" onClick={() => handleDeleteSavedFilter(v.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 bg-slate-50 border-t text-right">
              <button className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 font-semibold" onClick={() => setIsManageViewsOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
