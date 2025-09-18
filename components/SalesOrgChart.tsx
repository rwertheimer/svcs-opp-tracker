import React, { useMemo, useState } from 'react';
import type { Opportunity } from '../types';
import { ICONS } from '../constants';

interface SalesOrgChartProps {
    isOpen: boolean;
    onClose: (selected?: { owners: string[]; managers: string[] }) => void;
    opportunities: Opportunity[];
}

const SalesOrgChart: React.FC<SalesOrgChartProps> = ({ isOpen, onClose, opportunities }) => {
    const [selectedManagers, setSelectedManagers] = useState<Set<string>>(new Set());
    const [selectedOwners, setSelectedOwners] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState('');

    const orgStructure = useMemo(() => {
        const structure = new Map<string, Set<string>>();
        
        opportunities.forEach(opp => {
            const managerEmail = opp.opportunities_manager_of_opp_email;
            const ownerName = opp.opportunities_owner_name;

            // Ensure we have both a manager and an owner to create a relationship
            if (managerEmail && ownerName && managerEmail.trim() !== '' && ownerName.trim() !== '') {
                if (!structure.has(managerEmail)) {
                    structure.set(managerEmail, new Set());
                }
                structure.get(managerEmail)!.add(ownerName);
            }
        });

        // Convert the Map to a sorted array for stable rendering
        return Array.from(structure.entries()).map(([manager, reports]) => ({
            manager,
            reports: Array.from(reports).sort()
        })).sort((a, b) => a.manager.localeCompare(b.manager));

    }, [opportunities]);

    const filteredOrg = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return orgStructure;
        const results: { manager: string; reports: string[] }[] = [];
        for (const { manager, reports } of orgStructure) {
            const managerMatch = manager.toLowerCase().includes(term);
            const reportMatches = reports.filter(r => r.toLowerCase().includes(term));
            if (managerMatch) {
                // Show all reports under a matched manager
                results.push({ manager, reports });
            } else if (reportMatches.length > 0) {
                // Show only matched reports for this manager
                results.push({ manager, reports: reportMatches });
            }
        }
        return results;
    }, [orgStructure, search]);

    const toggleManager = (manager: string) => {
        setSelectedManagers(prev => {
            const next = new Set(prev);
            next.has(manager) ? next.delete(manager) : next.add(manager);
            return next;
        });
    };

    const toggleOwner = (owner: string) => {
        setSelectedOwners(prev => {
            const next = new Set(prev);
            next.has(owner) ? next.delete(owner) : next.add(owner);
            return next;
        });
    };

    const handleClose = () => {
        onClose({ owners: Array.from(selectedOwners), managers: Array.from(selectedManagers) });
        setSelectedManagers(new Set());
        setSelectedOwners(new Set());
    };

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center"
            aria-modal="true"
            role="dialog"
            onClick={handleClose}
        >
            <div 
                className="bg-white rounded-lg shadow-xl w-full max-w-4xl m-4 h-[80vh] flex flex-col animate-fade-in-up"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-4 border-b flex justify-between items-center flex-shrink-0">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center space-x-2">
                        {ICONS.users}
                        <span>Sales Organization Structure</span>
                    </h2>
                    <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
                        {ICONS.xMark}
                    </button>
                </div>
                <div className="p-6 overflow-y-auto">
                    <div className="mb-4 flex items-center space-x-2">
                        <div className="relative flex-grow">
                            <input
                                type="text"
                                placeholder="Search managers or reps..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full p-2 pl-10 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                            />
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                {ICONS.search}
                            </div>
                        </div>
                        {search && (
                            <button onClick={() => setSearch('')} className="px-3 py-2 bg-white text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 text-sm">Clear</button>
                        )}
                    </div>
                    {orgStructure.length === 0 ? (
                        <div className="text-center py-16 text-slate-500">
                            <p>No clear manager-report relationships could be derived from the current opportunity data.</p>
                        </div>
                    ) : (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {filteredOrg.map(({ manager, reports }) => (
                                <div key={manager} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-200">
                                        <div className="flex items-center space-x-3">
                                            <div className="text-indigo-600">
                                                {ICONS.userCircle}
                                            </div>
                                            <h4 className="text-md font-bold text-slate-800 truncate" title={manager}>{manager}</h4>
                                        </div>
                                        <button
                                            onClick={() => toggleManager(manager)}
                                            className={`px-2 py-0.5 text-xs rounded-md border ${selectedManagers.has(manager) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300'}`}
                                        >
                                            {selectedManagers.has(manager) ? 'Selected' : 'Select'}
                                        </button>
                                    </div>
                                    <ul className="space-y-2 pl-4">
                                        {reports.map(report => (
                                            <li key={report} className="text-sm text-slate-700 list-none">
                                                <button
                                                    onClick={() => toggleOwner(report)}
                                                    className={`w-full text-left px-2 py-1 rounded ${selectedOwners.has(report) ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-100'}`}
                                                >
                                                    • {report}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="p-4 bg-slate-50 border-t flex justify-between items-center flex-shrink-0">
                    <div className="text-xs text-slate-500">
                        {selectedManagers.size + selectedOwners.size > 0 ? (
                            <span>{selectedManagers.size} managers, {selectedOwners.size} owners selected</span>
                        ) : (
                            <span>Select managers and/or owners to build filters</span>
                        )}
                    </div>
                    <div className="space-x-2">
                        <button onClick={handleClose} className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 font-semibold">
                            Build Filters
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SalesOrgChart;
