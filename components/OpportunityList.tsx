import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { Opportunity, SavedFilter } from '../types';
import Tag from './Tag';
import { ICONS } from '../constants';

// --- Custom Hook for Resizable Columns ---
const useResizableColumns = (initialWidths: { [key: string]: number }) => {
    const [columnWidths, setColumnWidths] = useState(initialWidths);
    const isResizing = useRef<string | null>(null);
    const startX = useRef(0);
    const startWidth = useRef(0);

    const onMouseDown = useCallback((key: string, e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        isResizing.current = key;
        startX.current = e.clientX;
        startWidth.current = columnWidths[key] || 0;
    }, [columnWidths]);

    const onMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizing.current) return;
        const key = isResizing.current;
        const delta = e.clientX - startX.current;
        const newWidth = Math.max(startWidth.current + delta, 80); // Minimum width of 80px
        setColumnWidths(prev => ({ ...prev, [key]: newWidth }));
    }, []);

    const onMouseUp = useCallback(() => {
        isResizing.current = null;
    }, []);

    useEffect(() => {
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        return () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }, [onMouseMove, onMouseUp]);

    return { columnWidths, onMouseDown };
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
  activeFilterCount: number;
}

type SortKey = keyof Opportunity;

const OpportunityList: React.FC<OpportunityListProps> = ({ 
    opportunities, 
    onSelect, 
    savedFilters, 
    onSaveFilter, 
    onApplyFilter, 
    onClearFilters, 
    onAddScoping,
    onOpenFilterBuilder,
    activeFilterCount
}) => {
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' } | null>(null);
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

  const sortedOpportunities = useMemo(() => {
    let sortableItems = [...opportunities];
    
    sortableItems.sort((a, b) => {
        if (sortConfig) {
            const valA = a[sortConfig.key];
            const valB = b[sortConfig.key];
            
            let result = 0;
            if (valA < valB) result = -1;
            if (valA > valB) result = 1;

            if (result !== 0) return sortConfig.direction === 'ascending' ? result : -result;
        }

        // Default sort logic
        if (a.opportunities_amount !== b.opportunities_amount) return b.opportunities_amount - a.opportunities_amount;
        if (a.opportunities_incremental_bookings !== b.opportunities_incremental_bookings) return b.opportunities_incremental_bookings - a.opportunities_incremental_bookings;
        return new Date(a.opportunities_close_date).getTime() - new Date(b.opportunities_close_date).getTime();
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
    if (!sortConfig || sortConfig.key !== key) return '↕';
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
                <p className="text-sm text-slate-500 mt-1">Default view shows active NA opportunities closing in the next 90 days. Use filters to refine.</p>
            </div>
            <button onClick={onAddScoping} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-semibold text-sm flex items-center space-x-2 whitespace-nowrap">
                {ICONS.add}
                <span>Add Scoping Activity</span>
            </button>
        </div>
        
        {/* Saved Views and Filters Panel */}
        <div className="p-4 bg-slate-50 border-b space-y-4">
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
        </div>

      <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 350px)' }}>
        <table className="w-full text-sm text-left text-slate-500 border-separate border-spacing-0">
          <thead className="text-xs text-slate-700 uppercase">
            <tr>
              {tableHeaders.map(({ key, label, className, isSortable }) => (
                <th key={key} scope="col" 
                    className={`px-4 py-3 bg-slate-50 border-b border-slate-200 sticky top-0 z-10 ${className || ''}`}
                    style={{ width: columnWidths[key] }}
                    >
                  <div className="flex items-center justify-between group">
                    <span 
                        className={isSortable ? 'cursor-pointer' : ''}
                        onClick={() => isSortable && requestSort(key as SortKey)}>
                      {label} {isSortable && <span className="ml-1 text-slate-400">{getSortIndicator(key as SortKey)}</span>}
                    </span>
                     <div 
                        onMouseDown={(e) => onMouseDown(key, e)}
                        className="w-1 h-5 ml-2 cursor-col-resize opacity-0 group-hover:opacity-100 bg-slate-300"
                     />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {sortedOpportunities.map((opp) => (
              <tr key={opp.opportunities_id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => onSelect(opp)}>
                <td className="px-4 py-3 font-medium text-slate-800 break-words" style={{ width: columnWidths['accounts_salesforce_account_name'] }}>{opp.accounts_salesforce_account_name}</td>
                <td className="px-4 py-3 text-indigo-600 font-semibold break-words" style={{ width: columnWidths['opportunities_name'] }}>{opp.opportunities_name}</td>
                <td className="px-4 py-3 break-words" style={{ width: columnWidths['opportunities_owner_name'] }}>{opp.opportunities_owner_name}</td>
                <td className="px-4 py-3 break-words" style={{ width: columnWidths['opportunities_type'] }}>{opp.opportunities_type}</td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ width: columnWidths['opportunities_close_date'] }}>{formatDate(opp.opportunities_close_date)}</td>
                <td className="px-4 py-3 text-center" style={{ width: columnWidths['opportunities_stage_name'] }}><Tag status={opp.opportunities_stage_name} /></td>
                <td className="px-4 py-3 text-right font-medium text-slate-700 whitespace-nowrap" style={{ width: columnWidths['opportunities_incremental_bookings'] }}>{formatCurrency(opp.opportunities_incremental_bookings)}</td>
                <td className="px-4 py-3 text-right font-bold text-green-700 whitespace-nowrap" style={{ width: columnWidths['opportunities_amount'] }}>{formatCurrency(opp.opportunities_amount)}</td>
                <td className="px-4 py-3 text-center" style={{ width: columnWidths['opportunities_has_services_flag'] }}>
                    <div className="flex items-center justify-center space-x-2">
                        <Tag status={opp.opportunities_has_services_flag} />
                        {opp.disposition?.status === 'Services Fit' && <span className="text-green-500" title="Disposition: Services Fit">{ICONS.checkCircle}</span>}
                        {opp.disposition?.status === 'No Services Opp' && <span className="text-red-500" title="Disposition: No Services Opp">{ICONS.xCircle}</span>}
                        {opp.disposition?.status === 'Watchlist' && <span className="text-blue-500" title="Disposition: Watchlist">{ICONS.eye}</span>}
                   </div>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap" style={{ width: columnWidths['opportunities_amount_services'] }}>{formatCurrency(opp.opportunities_amount_services)}</td>
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
  { key: 'accounts_salesforce_account_name', label: 'Account Name', isSortable: true },
  { key: 'opportunities_name', label: 'Opportunity Name', isSortable: true },
  { key: 'opportunities_owner_name', label: 'Owner Name', isSortable: true },
  { key: 'opportunities_type', label: 'Opportunity Type', isSortable: true },
  { key: 'opportunities_close_date', label: 'Close Date', isSortable: true },
  { key: 'opportunities_stage_name', label: 'Stage', isSortable: true, className: 'text-center' },
  { key: 'opportunities_incremental_bookings', label: 'Incr. Bookings', className: 'text-right', isSortable: true },
  { key: 'opportunities_amount', label: 'Total Opp Amount', className: 'text-right', isSortable: true },
  { key: 'opportunities_has_services_flag', label: 'Services Attached', className: 'text-center', isSortable: true },
  { key: 'opportunities_amount_services', label: 'Services Amount', className: 'text-right', isSortable: true },
];

export default OpportunityList;