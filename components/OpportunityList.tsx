
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Opportunity, FilterCriteria, SavedFilter } from '../types';
import { OpportunityStage } from '../types';
import Tag from './Tag';
import { ICONS } from '../constants';

// --- Reusable Multi-Select Dropdown Component ---
interface MultiSelectDropdownProps {
  options: string[];
  selectedOptions: string[];
  onSelectionChange: (newSelection: string[]) => void;
  placeholder: string;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({ options, selectedOptions, onSelectionChange, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [ref]);

    const handleSelect = (option: string) => {
        const newSelection = selectedOptions.includes(option)
            ? selectedOptions.filter(item => item !== option)
            : [...selectedOptions, option];
        onSelectionChange(newSelection);
    };

    const displayText = selectedOptions.length > 0 ? `${selectedOptions.length} selected` : placeholder;

    return (
        <div className="relative" ref={ref}>
            <button onClick={() => setIsOpen(!isOpen)} className="w-full bg-white border border-slate-300 rounded-md shadow-sm px-4 py-2 text-left text-sm flex justify-between items-center">
                <span className={selectedOptions.length > 0 ? 'text-slate-800' : 'text-slate-500'}>{displayText}</span>
                <span className="text-slate-400">▼</span>
            </button>
            {isOpen && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {options.map(option => (
                        <label key={option} className="flex items-center px-4 py-2 text-sm hover:bg-slate-100 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={selectedOptions.includes(option)}
                                onChange={() => handleSelect(option)}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="ml-3 text-slate-700">{option}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};


// --- Main Component ---
interface OpportunityListProps {
  opportunities: Opportunity[];
  allOpportunities: Opportunity[];
  onSelect: (opportunity: Opportunity) => void;
  filters: FilterCriteria;
  onFilterChange: (newFilters: Partial<FilterCriteria>) => void;
  savedFilters: SavedFilter[];
  onSaveFilter: (name: string) => void;
  onApplyFilter: (id: string) => void;
  onClearFilters: () => void;
  onAddScoping: () => void;
}

type SortKey = keyof Opportunity;

const OpportunityList: React.FC<OpportunityListProps> = ({ opportunities, allOpportunities, onSelect, filters, onFilterChange, savedFilters, onSaveFilter, onApplyFilter, onClearFilters, onAddScoping }) => {
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' } | null>({ key: 'opportunities_amount', direction: 'descending' });
  const [newViewName, setNewViewName] = useState('');

  const salesReps = useMemo(() => [...new Set(allOpportunities.map(o => o.opportunities_owner_name))].sort(), [allOpportunities]);
  const statuses = useMemo(() => Object.values(OpportunityStage), []);
  
  const sortedOpportunities = useMemo(() => {
    let sortableItems = [...opportunities];
    
    sortableItems.sort((a, b) => {
        // If a sort configuration is set by the user, use it.
        if (sortConfig) {
            const valA = a[sortConfig.key];
            const valB = b[sortConfig.key];
            
            let result = 0;
            if (valA < valB) result = -1;
            if (valA > valB) result = 1;

            // If the primary sort column values are equal, apply the secondary default sort.
            if (result === 0) {
                if (a.opportunities_amount !== b.opportunities_amount) {
                    return b.opportunities_amount - a.opportunities_amount;
                }
                return b.opportunities_incremental_bookings - a.opportunities_incremental_bookings;
            }

            return sortConfig.direction === 'ascending' ? result : -result;
        }

        // Default sort if no config is set (which shouldn't happen with initial state)
        if (a.opportunities_amount !== b.opportunities_amount) {
            return b.opportunities_amount - a.opportunities_amount;
        }
        return b.opportunities_incremental_bookings - a.opportunities_incremental_bookings;
    });

    return sortableItems;
  }, [opportunities, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const getSortIndicator = (key: SortKey) => {
    if (!sortConfig || sortConfig.key !== key) {
      return '↕';
    }
    return sortConfig.direction === 'ascending' ? '↑' : '↓';
  };

  const formatCurrency = (amount: number) => {
    if (!amount || amount === 0) return '-';
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

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center">
            <div>
                <h2 className="text-xl font-bold text-slate-800">Professional Services Opportunities</h2>
                <p className="text-sm text-slate-500 mt-1">Default view shows NA opportunities closing in the next 90 days. Use filters to refine.</p>
            </div>
            <button onClick={onAddScoping} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-semibold text-sm flex items-center space-x-2 whitespace-nowrap">
                {ICONS.add}
                <span>Add Scoping Activity</span>
            </button>
        </div>
        
        {/* Saved Views and Filters Panel */}
        <div className="p-4 bg-slate-50 border-b space-y-4">
            {/* Saved Views */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        placeholder="Enter name for new view..."
                        value={newViewName}
                        onChange={e => setNewViewName(e.target.value)}
                        className="flex-grow p-2 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    />
                    <button onClick={handleSaveClick} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-semibold text-sm flex items-center space-x-2">
                        {ICONS.save}<span>Save View</span>
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
                <div className="lg:col-span-2">
                    <input 
                        type="text"
                        placeholder="Search Opp or Account..."
                        value={filters.searchTerm}
                        onChange={e => onFilterChange({ searchTerm: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-md shadow-sm"
                    />
                </div>
                <div>
                     <MultiSelectDropdown 
                        options={statuses}
                        selectedOptions={filters.statuses}
                        onSelectionChange={(statuses) => onFilterChange({ statuses: statuses as OpportunityStage[] })}
                        placeholder="Status"
                     />
                </div>
                 <div>
                    <MultiSelectDropdown 
                        options={salesReps}
                        selectedOptions={filters.salesReps}
                        onSelectionChange={(salesReps) => onFilterChange({ salesReps })}
                        placeholder="Sales Rep"
                     />
                </div>
                <div>
                    <select 
                        value={filters.disposition}
                        onChange={e => onFilterChange({ disposition: e.target.value as FilterCriteria['disposition'] })}
                        className="w-full p-2 border border-slate-300 rounded-md shadow-sm bg-white"
                    >
                        <option value="any">Any Disposition</option>
                        <option value="not-reviewed">Not Reviewed</option>
                        <option value="services-fit">Services Fit</option>
                        <option value="no-services-opp">No Services Opp</option>
                        <option value="watchlist">Watchlist</option>
                    </select>
                </div>
                <div>
                    <button onClick={onClearFilters} className="w-full px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 font-semibold">
                        Clear Filters
                    </button>
                </div>
            </div>
        </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-500">
          <thead className="text-xs text-slate-700 uppercase bg-slate-50">
            <tr>
              {tableHeaders.map(({ key, label, className }) => (
                <th key={key} scope="col" className={`px-4 py-3 cursor-pointer hover:bg-slate-100 ${className || ''}`} onClick={() => requestSort(key as SortKey)}>
                  {label} <span className="ml-1 text-slate-400">{getSortIndicator(key as SortKey)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedOpportunities.map((opp) => (
              <tr key={opp.opportunities_id} className="bg-white border-b hover:bg-slate-50 cursor-pointer" onClick={() => onSelect(opp)}>
                <td className="px-4 py-3 font-medium text-slate-800">{opp.accounts_salesforce_account_name}</td>
                <td className="px-4 py-3 text-indigo-600 font-semibold">{opp.opportunities_name}</td>
                <td className="px-4 py-3">{opp.opportunities_owner_name}</td>
                <td className="px-4 py-3">{formatDate(opp.accounts_subscription_end_date)}</td>
                <td className="px-4 py-3 text-right font-medium text-slate-700">{formatCurrency(opp.opportunities_incremental_bookings)}</td>
                <td className="px-4 py-3 text-right font-bold text-green-700">{formatCurrency(opp.opportunities_amount)}</td>
                <td className="px-4 py-3 text-center">{opp.opportunities_has_services_flag}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(opp.opportunities_amount_services)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center space-x-2">
                    <Tag status={opp.opportunities_stage_name} />
                    {opp.disposition?.status === 'Services Fit' && <span className="text-green-500" title="Disposition: Services Fit">{ICONS.checkCircle}</span>}
                    {opp.disposition?.status === 'No Services Opp' && <span className="text-red-500" title="Disposition: No Services Opp">{ICONS.xCircle}</span>}
                    {opp.disposition?.status === 'Watchlist' && <span className="text-blue-500" title="Disposition: Watchlist">{ICONS.eye}</span>}
                   </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  { key: 'accounts_subscription_end_date', label: 'Close Date' },
  { key: 'opportunities_incremental_bookings', label: 'Incr. Bookings', className: 'text-right' },
  { key: 'opportunities_amount', label: 'Total Opp Amount', className: 'text-right' },
  { key: 'opportunities_has_services_flag', label: 'Services Attached', className: 'text-center' },
  { key: 'opportunities_amount_services', label: 'Services Amount', className: 'text-right' },
  { key: 'opportunities_stage_name', label: 'Stage' },
];

export default OpportunityList;