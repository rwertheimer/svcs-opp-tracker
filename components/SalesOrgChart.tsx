import React, { useMemo } from 'react';
import type { Opportunity } from '../types';
import { ICONS } from '../constants';

interface SalesOrgChartProps {
    isOpen: boolean;
    onClose: () => void;
    opportunities: Opportunity[];
}

const SalesOrgChart: React.FC<SalesOrgChartProps> = ({ isOpen, onClose, opportunities }) => {

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

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center"
            aria-modal="true"
            role="dialog"
            onClick={onClose}
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
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        {ICONS.xMark}
                    </button>
                </div>
                <div className="p-6 overflow-y-auto">
                    {orgStructure.length === 0 ? (
                        <div className="text-center py-16 text-slate-500">
                            <p>No clear manager-report relationships could be derived from the current opportunity data.</p>
                        </div>
                    ) : (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {orgStructure.map(({ manager, reports }) => (
                                <div key={manager} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                    <div className="flex items-center space-x-3 mb-3 pb-3 border-b border-slate-200">
                                        <div className="text-indigo-600">
                                            {ICONS.userCircle}
                                        </div>
                                        <h4 className="text-md font-bold text-slate-800 truncate" title={manager}>{manager}</h4>
                                    </div>
                                    <ul className="space-y-2 pl-4">
                                        {reports.map(report => (
                                            <li key={report} className="text-sm text-slate-700 list-disc list-outside marker:text-indigo-400">
                                                {report}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="p-4 bg-slate-50 border-t flex justify-end space-x-2 flex-shrink-0">
                    <button onClick={onClose} className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 font-semibold">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SalesOrgChart;
