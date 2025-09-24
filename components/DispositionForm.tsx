
import React, { useState, useEffect } from 'react';
import type { Disposition, Opportunity } from '../types';
import { DispositionStatus } from '../types';
import { ICONS, FORECAST_CATEGORIES } from '../constants';

interface DispositionFormProps {
    opportunity: Opportunity;
    disposition: Disposition;
    onStatusChange: (status: DispositionStatus) => boolean | void;
    onDispositionChange: (updates: Partial<Disposition>) => void;
    lastUpdatedBy?: string;
}

const DispositionForm: React.FC<DispositionFormProps> = ({
    opportunity,
    disposition,
    onStatusChange,
    onDispositionChange,
    lastUpdatedBy,
}) => {
    // Local state for text areas to prevent re-renders on every keystroke
    const [localNotes, setLocalNotes] = useState(disposition.notes || '');
    const [localReason, setLocalReason] = useState(disposition.reason || '');

    useEffect(() => {
        setLocalNotes(disposition.notes || '');
    }, [disposition.notes]);

    useEffect(() => {
        setLocalReason(disposition.reason || '');
    }, [disposition.reason]);


    const handleSetDispositionStatus = (status: DispositionStatus) => {
        const allowChange = onStatusChange(status);
        if (allowChange === false) return;
    };

    const formatCurrency = (amount: number | null | undefined) => {
        if (amount === null || amount === undefined) return 'N/A';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
    };

    return (
        <div className="bg-white rounded-lg shadow-lg">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    {ICONS.clipboard}
                    <h3 className="text-lg font-semibold text-slate-700">Disposition</h3>
                </div>
                {lastUpdatedBy && (
                    <div className="text-xs text-slate-500">
                        Last updated by: <span className="font-semibold">{lastUpdatedBy}</span> (Version {disposition.version})
                    </div>
                )}
            </div>
            <div className="p-6 space-y-6">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Disposition</label>
                <div className="flex space-x-2 flex-wrap gap-2">
                    <button onClick={() => handleSetDispositionStatus('Services Fit')} className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center space-x-2 transition ${disposition.status === 'Services Fit' ? 'bg-green-600 text-white shadow' : 'bg-white text-slate-700 border hover:bg-green-50'}`}>
                        {ICONS.check} <span>Services Fit</span>
                    </button>
                    <button onClick={() => handleSetDispositionStatus('No Action Needed')} className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center space-x-2 transition ${disposition.status === 'No Action Needed' ? 'bg-red-600 text-white shadow' : 'bg-white text-slate-700 border hover:bg-red-50'}`}>
                        {ICONS.xMark} <span>No Action Needed</span>
                    </button>
                    <button onClick={() => handleSetDispositionStatus('Watchlist')} className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center space-x-2 transition ${disposition.status === 'Watchlist' ? 'bg-blue-600 text-white shadow' : 'bg-white text-slate-700 border hover:bg-blue-50'}`}>
                        {ICONS.eye} <span>Watchlist</span>
                    </button>
                </div>
            </div>

            {disposition.status === 'No Action Needed' && opportunity.opportunities_has_services_flag === 'No' && (
                <div className="animate-fade-in">
                    <label htmlFor="reason" className="block text-sm font-medium text-slate-700 mb-2">Reason for No Services Opp</label>
                    <textarea
                        id="reason"
                        rows={3}
                        className="w-full p-2 border border-slate-300 rounded-md shadow-sm"
                        placeholder="e.g., Customer has a capable in-house team..."
                        value={localReason}
                        onChange={e => setLocalReason(e.target.value)}
                        onBlur={() => onDispositionChange({ reason: localReason })}
                    />
                </div>
            )}

            {disposition.status === 'Services Fit' && (
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg space-y-4 animate-fade-in">
                    <h4 className="text-sm font-bold text-slate-800">Services Forecast Adjustment</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <label htmlFor="services-amount-override" className="block text-xs font-medium text-slate-600 mb-1">SA Adjusted Amount</label>
                            <input id="services-amount-override" type="number" step="1000" className="w-full p-2 border border-slate-300 rounded-md shadow-sm" placeholder={formatCurrency(opportunity.opportunities_amount_services)} value={disposition.services_amount_override ?? ''} onChange={e => onDispositionChange({ services_amount_override: e.target.value === '' ? undefined : Number(e.target.value) })} />
                        </div>
                        <div>
                            <label htmlFor="forecast-category-override" className="block text-xs font-medium text-slate-600 mb-1">SA Adjusted Category</label>
                            <select id="forecast-category-override" className="w-full p-2 bg-white border border-slate-300 rounded-md shadow-sm" value={disposition.forecast_category_override ?? ''} onChange={e => onDispositionChange({ forecast_category_override: e.target.value === '' ? undefined : e.target.value })}>
                                <option value="">Use SFDC: {opportunity.opportunities_forecast_category}</option>
                                {FORECAST_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                             </select>
                        </div>
                    </div>
                </div>
            )}

            <div>
                <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-2">General Notes</label>
                <textarea
                    id="notes"
                    rows={8}
                    className="w-full p-2 border border-slate-300 rounded-md shadow-sm"
                    placeholder="e.g., Customer is planning a major migration..."
                    value={localNotes}
                    onChange={e => setLocalNotes(e.target.value)}
                    onBlur={() => onDispositionChange({ notes: localNotes })}
                />
            </div>
        </div>
    </div>
  );
};

export default DispositionForm;
