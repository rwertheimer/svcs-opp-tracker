

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { Opportunity, SavedFilter } from '../types';
import Tag from './Tag';
import { ICONS } from '../constants';

// --- Custom Hook for Resizable Columns (Final, robust implementation) ---
const useResizableColumns = (initialWidths: { [key: string]: number }) => {
    const [columnWidths, setColumnWidths] = useState(initialWidths);
    
    const resizingColumnRef = useRef<{
        key: string;
        startX: number;
        startWidth: number;
    } | null>(null);

    const onMouseDown = useCallback((key: string, e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        
        const thElement = e.currentTarget.closest('th');
        if (!thElement) return;

        resizingColumnRef.current = {
            key,
            startX: e.clientX,
            startWidth: thElement.offsetWidth,
        };
    }, []);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!resizingColumnRef.current) return;

            document.body.style.cursor = 'col-resize';
            
            const { key, startX, startWidth } = resizingColumnRef.current;
            const deltaX = e.clientX - startX;
            const newWidth = Math.max(startWidth + deltaX, 80); // Minimum width 80px

            setColumnWidths(prev => ({
                ...prev,
                [key]: newWidth
            }));
        };

        const handleMouseUp = () => {
            if (!resizingColumnRef.current) return;
            document.body.style.cursor = '';
            resizingColumnRef.current = null;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    return { columnWidths, onMouseDown };
};


// --- NEW: Forecast Summary Component ---
const ForecastSummary: React.FC<{ opportunities: Opportunity[] }> = ({ opportunities }) => {
    const forecast = useMemo(() => {
        const initialTotals = {
            'Commit': 0,
            'Most Likely': 0,
            'Upside': 0,
            'Omitted': 0,
        };

        const mapCategoryToLabel = (dbCategory: string | null | undefined): keyof typeof initialTotals => {
            if (!dbCategory) {
                return 'Upside'; // A reasonable default for un-categorized items
            }
            const category = dbCategory.trim();

            // Handle direct matches from overrides or clean data first
            if (category === 'Commit') return 'Commit';
            if (category === 'Most Likely') return 'Most Likely';
            if (category === 'Upside') return 'Upside';
            if (category === 'Omitted') return 'Omitted';
            
            // Handle SFDC/Postgres values
            if (category.includes('Commit')) return 'Commit'; // "3 - Commit"
            if (category.includes('Most Likely')) return 'Most Likely'; // "2 - Most Likely"
            if (category.includes('Upside')) return 'Upside'; // "1 - Upside"
            if (category.includes('Omitted')) return 'Omitted'; // "0 - Omitted"

            // Handle legacy 'Pipeline' or 'Best Case' categories from SFDC and map them to Most Likely.
            if (category.includes('Pipeline') || category.includes('Best Case')) return 'Most Likely';
            
            // Default any other unexpected values to a non-committal category.
            return 'Upside';
        };

        return opportunities.reduce((totals, opp) => {
            // Use override if available, otherwise use the value from SFDC
            const rawCategory = opp.disposition?.forecast_category_override || opp.opportunities_forecast_category;
            
            // Map the raw DB/override value to one of our standard labels
            const targetCategory = mapCategoryToLabel(rawCategory);

            // Use override amount if available, otherwise use SFDC amount. Coalesce null/undefined to 0.
            const rawAmount = opp.disposition?.services_amount_override ?? opp.opportunities_amount_services;
            const amount = Number(rawAmount) || 0;

            // Add the amount to the correct bucket.
            totals[targetCategory] += amount;
            
            return totals;
        }, initialTotals);

    }, [opportunities]);

    const formatCurrency = (amount: number | null) => {
        if (amount === null || amount === undefined || isNaN(amount)) return '$0';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
    };

    return (
        <div className="p-4 border-b bg-white">
            <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-3">Services Forecast (Current View)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                {Object.entries(forecast).map(([category, total]) => (
                    <div key={category} className="bg-slate-50 p-3 rounded-md shadow-sm border border-slate-200">
                        <p className="text-xs text-slate-500 font-semibold">{category}</p>
                        <p className="text-xl font-bold text-indigo-700 mt-1">{formatCurrency(total)}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};


// --- Main Component ---
interface OpportunityListProps {
  opportunities: Opportunity[];
  onSelect: (opportunity: Opportunity) => void;
  savedFilters: SavedFilter[];
  onSaveFilter: (name: string) => void;
  onApplyFilter: (id: string) => void;
  onClearFilters: () => void;
  onAddScoping: () => void;
  onOpenFilterBuilder: () => void;
  onOpenOrgChart: () => void;
  activeFilterCount: number;
  showAllOpportunities: boolean;
  onToggleShowAll: (value: boolean) => void;
}

const OpportunityList: React.FC<OpportunityListProps> = ({ 
    opportunities, 
    onSelect, 
    savedFilters, 
    onSaveFilter, 
    onApplyFilter, 
    onClearFilters, 
    onAddScoping,
    onOpenFilterBuilder,
    onOpenOrgChart,
    activeFilterCount,
    showAllOpportunities,
    onToggleShowAll
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [newViewName, setNewViewName] = useState('');

  // Initial column widths
  const initialWidths = useMemo(() => ({
    accounts_salesforce_account_name: 200,
    opportunities_name: 250,
    opportunities_owner_name: 150,
    opportunities_type: 150,
    opportunities_close_date: 120,
    opportunities_stage_name: 150,
    opportunities_incremental_bookings: 150,
    opportunities_amount: 150,
    opportunities_has_services_flag: 180,
    opportunities_amount_services: 150,
  }), []);
  
  const { columnWidths, onMouseDown } = useResizableColumns(initialWidths);

  const displayedOpportunities = useMemo(() => {
    let filteredItems = [...opportunities];
    
    // Apply search term filter
    if (searchTerm) {
        const lowercasedFilter = searchTerm.toLowerCase();
        filteredItems = filteredItems.filter(opp => 
            opp.accounts_salesforce_account_name.toLowerCase().includes(lowercasedFilter) ||
            opp.opportunities_name.toLowerCase().includes(lowercasedFilter)
        );
    }
    
    // Apply default sort logic
    filteredItems.sort((a, b) => {
        if (a.opportunities_amount !== b.opportunities_amount) return (b.opportunities_amount || 0) - (a.opportunities_amount || 0);
        if (a.opportunities_incremental_bookings !== b.opportunities_incremental_bookings) return (b.opportunities_incremental_bookings || 0) - (a.opportunities_incremental_bookings || 0);
        return new Date(a.opportunities_close_date).getTime() - new Date(b.opportunities_close_date).getTime();
    });

    return filteredItems;
  }, [opportunities, searchTerm]);

  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined || amount === 0) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
  };
  
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    return utcDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const handleSaveClick = () => {
    onSaveFilter(newViewName);
    setNewViewName('');
  }

  const renderServicesAmount = (opp: Opportunity) => {
    const sfdcAmount = opp.opportunities_amount_services;
    const overrideAmount = opp.disposition?.services_amount_override;

    if (overrideAmount !== undefined && overrideAmount !== null && overrideAmount !== sfdcAmount) {
      return (
        <div className="flex items-center justify-end space-x-2" title={`SA Adjusted Amount. Original SFDC amount was ${formatCurrency(sfdcAmount)}.`}>
          <span className="font-bold text-indigo-700">{formatCurrency(overrideAmount)}</span>
          <span className="text-slate-400 line-through text-xs">{formatCurrency(sfdcAmount)}</span>
          <span className="text-slate-400">{ICONS.pencil}</span>
        </div>
      );
    }
    
    return formatCurrency(sfdcAmount);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center">
            <div>
                <h2 className="text-xl font-bold text-slate-800">Professional Services Opportunities</h2>
                <p className="text-sm text-slate-500 mt-1">Shows active NA opportunities closing in the next 120 days. Use the toggle to show all, or filters to refine.</p>
            </div>
            <div className="flex items-center space-x-2">
                <button onClick={onAddScoping} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-semibold text-sm flex items-center space-x-2 whitespace-nowrap">
                    {ICONS.add}
                    <span>Add Scoping Activity</span>
                </button>
                 <button onClick={onOpenOrgChart} className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 font-semibold text-sm flex items-center space-x-2 whitespace-nowrap">
                    {ICONS.users}
                    <span>View Org Chart</span>
                </button>
            </div>
        </div>
        
        <ForecastSummary opportunities={displayedOpportunities} />

        {/* Saved Views and Filters Panel */}
        <div className="p-4 bg-slate-50 border-b space-y-4">
             <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    {ICONS.search}
                </div>
                <input
                    type="text"
                    placeholder="Search by account or opportunity name..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full p-2 pl-10 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                    <select
                        onChange={(e) => e.target.value ? onApplyFilter(e.target.value) : onClearFilters()}
                        className="flex-grow p-2 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        value={""}
                    >
                        <option value="">Load a Saved View</option>
                        {savedFilters.map(sf => (
                            <option key={sf.id} value={sf.id}>{sf.name}</option>
                        ))}
                    </select>
                </div>
                 <div className="flex items-center space-x-2">
                    <input
                        type="text"
                        placeholder="Enter name to save view..."
                        value={newViewName}
                        onChange={e => setNewViewName(e.target.value)}
                        className="flex-grow p-2 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    />
                    <button onClick={handleSaveClick} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-semibold text-sm flex items-center space-x-2">
                        {ICONS.save}<span>Save</span>
                    </button>
                </div>
                 <div className="flex items-center space-x-2">
                     <button onClick={onOpenFilterBuilder} className="relative w-full px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 font-semibold text-sm flex items-center space-x-2">
                        {ICONS.filter}
                        <span>Advanced Filter</span>
                        {activeFilterCount > 0 && <span className="absolute -top-2 -right-2 bg-indigo-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">{activeFilterCount}</span>}
                    </button>
                    <button onClick={onClearFilters} className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 font-semibold text-sm">
                        Clear
                    </button>
                </div>
            </div>
             {/* --- NEW: Debug Toggle --- */}
            <div className="mt-4 pt-4 border-t border-slate-200 flex items-center space-x-3">
                <div className="relative inline-flex items-center cursor-pointer">
                     <input 
                        type="checkbox" 
                        id="showAllToggle"
                        checked={showAllOpportunities}
                        onChange={(e) => onToggleShowAll(e.target.checked)}
                        className="sr-only peer" 
                     />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </div>
                <label htmlFor="showAllToggle" className="text-sm font-medium text-slate-700">
                    Show All Active Opportunities (ignores 120-day filter)
                </label>
            </div>
        </div>

      <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
        <table className="w-full table-fixed text-sm text-left text-slate-500 border-separate border-spacing-0">
          <colgroup>
            {tableHeaders.map(({ key }) => (
              <col key={`col-${key}`} style={{ width: columnWidths[key] }} />
            ))}
          </colgroup>
          <thead className="text-xs text-slate-700 uppercase">
            <tr>
              {tableHeaders.map(({ key, label, className }) => (
                <th key={key} scope="col" 
                    className={`relative group px-4 py-3 bg-slate-50 border-b border-slate-200 sticky top-0 z-10 ${className || ''}`}
                    >
                  <div className="flex items-center justify-between">
                    <span>{label}</span>
                  </div>
                  <div
                      onMouseDown={(e) => onMouseDown(key, e)}
                      className="absolute top-0 right-0 h-full w-4 cursor-col-resize flex items-center justify-end z-20"
                   >
                       <div className="w-px h-6 bg-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                   </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {displayedOpportunities.map((opp) => (
              <tr key={opp.opportunities_id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => onSelect(opp)}>
                <td className="px-4 py-3 font-medium text-slate-800 truncate" title={opp.accounts_salesforce_account_name}>{opp.accounts_salesforce_account_name}</td>
                <td className="px-4 py-3 text-indigo-600 font-semibold truncate" title={opp.opportunities_name}>{opp.opportunities_name}</td>
                <td className="px-4 py-3 truncate" title={opp.opportunities_owner_name}>{opp.opportunities_owner_name}</td>
                <td className="px-4 py-3 truncate" title={opp.opportunities_type}>{opp.opportunities_type}</td>
                <td className="px-4 py-3 whitespace-nowrap">{formatDate(opp.opportunities_close_date)}</td>
                <td className="px-4 py-3 text-center truncate" title={opp.opportunities_stage_name}><Tag status={opp.opportunities_stage_name} /></td>
                <td className="px-4 py-3 text-right font-medium text-slate-700 whitespace-nowrap">{formatCurrency(opp.opportunities_incremental_bookings)}</td>
                <td className="px-4 py-3 text-right font-bold text-green-700 whitespace-nowrap">{formatCurrency(opp.opportunities_amount)}</td>
                <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center space-x-2">
                        <Tag status={opp.opportunities_has_services_flag} />
                        {opp.disposition?.status === 'Services Fit' && <span className="text-green-500" title="Disposition: Services Fit">{ICONS.checkCircle}</span>}
                        {opp.disposition?.status === 'No Action Needed' && <span className="text-red-500" title="Disposition: No Action Needed">{ICONS.xCircle}</span>}
                        {opp.disposition?.status === 'Watchlist' && <span className="text-blue-500" title="Disposition: Watchlist">{ICONS.eye}</span>}
                   </div>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{renderServicesAmount(opp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {opportunities.length > 0 && displayedOpportunities.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <p>No opportunities match your search or filters.</p>
        </div>
      )}
      {opportunities.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <p>No opportunities match the current filters.</p>
        </div>
      )}
    </div>
  );
};

const tableHeaders = [
  { key: 'accounts_salesforce_account_name', label: 'Account Name' },
  { key: 'opportunities_name', label: 'Opportunity Name' },
  { key: 'opportunities_owner_name', label: 'Owner Name' },
  { key: 'opportunities_type', label: 'Opportunity Type' },
  { key: 'opportunities_close_date', label: 'Close Date' },
  { key: 'opportunities_stage_name', label: 'Stage', className: 'text-center' },
  { key: 'opportunities_incremental_bookings', label: 'Incr. Bookings', className: 'text-right' },
  { key: 'opportunities_amount', label: 'Total Opp Amount', className: 'text-right' },
  { key: 'opportunities_has_services_flag', label: 'Services Attached', className: 'text-center' },
  { key: 'opportunities_amount_services', label: 'Services Amount', className: 'text-right' },
];

export default OpportunityList;