import React, { useState, useEffect } from 'react';
import { Opportunity, ActionItem, Disposition, ActionItemStatus, DispositionStatus, Document } from '../types';
import { ICONS, FORECAST_CATEGORIES } from '../constants';

const defaultActionItems: Omit<ActionItem, 'id' | 'documents'>[] = [
    { name: 'Initial Scoping Call', status: ActionItemStatus.NotStarted, dueDate: '', notes: '' },
    { name: 'Develop Initial Proposal', status: ActionItemStatus.NotStarted, dueDate: '', notes: '' },
    { name: 'Share Initial Proposal', status: ActionItemStatus.NotStarted, dueDate: '', notes: '' },
    { name: 'Revise and Finalize Proposal', status: ActionItemStatus.NotStarted, dueDate: '', notes: '' },
    { name: 'Approvals', status: ActionItemStatus.NotStarted, dueDate: '', notes: '' },
];

interface DispositionFormProps {
    onSave: (disposition: Disposition) => void;
    opportunity: Opportunity;
}

const DispositionForm: React.FC<DispositionFormProps> = ({ onSave, opportunity }) => {
  const [disposition, setDisposition] = useState<Disposition>(opportunity.disposition || {
    status: 'Not Reviewed',
    notes: '',
    actionItems: [],
    reason: ''
  });
  const [newActionText, setNewActionText] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  useEffect(() => {
    setDisposition(opportunity.disposition || {
        status: 'Not Reviewed',
        notes: '',
        actionItems: [],
        reason: ''
    });
  }, [opportunity.disposition]);

  const handleSetDispositionStatus = (status: DispositionStatus) => {
    setDisposition(prev => {
        const newState = {...prev, status};
        if (status === 'Services Fit') {
            newState.reason = '';
            if (newState.actionItems.length === 0) {
                 newState.actionItems = defaultActionItems.map(item => ({...item, id: Date.now().toString() + Math.random(), documents: [] }));
            }
        } else {
            newState.actionItems = [];
             // Clear reason unless it's a "No Action Needed" on an opp without services
            if (status !== 'No Action Needed' || (status === 'No Action Needed' && opportunity.opportunities_has_services_flag === 'Yes')) {
                newState.reason = '';
            }
        }
        return newState;
    });
  };
  
  const handleActionItemAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (newActionText.trim()) {
      const newAction: ActionItem = {
        id: Date.now().toString(),
        name: newActionText.trim(),
        status: ActionItemStatus.NotStarted,
        dueDate: '',
        notes: '',
        documents: []
      };
      setDisposition(prev => ({ ...prev, actionItems: [...prev.actionItems, newAction] }));
      setNewActionText('');
    }
  };

  const handleActionItemChange = (id: string, field: keyof ActionItem, value: any) => {
    setDisposition(prev => ({
        ...prev,
        actionItems: prev.actionItems.map(item =>
            item.id === id ? { ...item, [field]: value } : item
        )
    }));
  };
  
  const handleDocumentAdd = (itemId: string) => {
    setDisposition(prev => ({
      ...prev,
      actionItems: prev.actionItems.map(item => {
        if (item.id === itemId) {
          const newDoc: Document = { id: Date.now().toString(), text: '', url: '' };
          const documents = item.documents ? [...item.documents, newDoc] : [newDoc];
          return { ...item, documents };
        }
        return item;
      })
    }));
  };
  
  const handleDocumentChange = (itemId: string, docId: string, field: 'text' | 'url', value: string) => {
     setDisposition(prev => ({
      ...prev,
      actionItems: prev.actionItems.map(item => {
        if (item.id === itemId && item.documents) {
          const documents = item.documents.map(doc => 
            doc.id === docId ? { ...doc, [field]: value } : doc
          );
          return { ...item, documents };
        }
        return item;
      })
    }));
  };

  const handleDocumentDelete = (itemId: string, docId: string) => {
     setDisposition(prev => ({
      ...prev,
      actionItems: prev.actionItems.map(item => {
        if (item.id === itemId && item.documents) {
          const documents = item.documents.filter(doc => doc.id !== docId);
          return { ...item, documents };
        }
        return item;
      })
    }));
  };


  const handleActionItemDelete = (id: string) => {
    setDisposition(prev => ({
      ...prev,
      actionItems: prev.actionItems.filter(item => item.id !== id),
    }));
  };

  const handleSubmit = () => {
    onSave(disposition);
  };
  
  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);

  return (
    <div className="bg-white rounded-lg shadow-lg">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center space-x-3">
            {ICONS.clipboard}
            <h3 className="text-lg font-semibold text-slate-700">Disposition & Action Plan</h3>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Side: Disposition & Notes */}
            <div className="space-y-6">
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
                            className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="e.g., Customer has a capable in-house team, deal size too small..."
                            value={disposition.reason}
                            onChange={e => setDisposition(prev => ({ ...prev, reason: e.target.value }))}
                        />
                    </div>
                )}
                
                {/* --- NEW: Services Forecast Adjustment --- */}
                {disposition.status === 'Services Fit' && (
                    <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg space-y-4 animate-fade-in">
                        <h4 className="text-sm font-bold text-slate-800">Services Forecast Adjustment</h4>
                        <div className="space-y-3">
                             <div>
                                <label htmlFor="services-amount-override" className="block text-xs font-medium text-slate-600">SA Adjusted Amount</label>
                                <div className="mt-1 flex items-center text-sm">
                                    <span className="text-slate-500 mr-2">SFDC Amount: {formatCurrency(opportunity.opportunities_amount_services)}</span>
                                    <input
                                        id="services-amount-override"
                                        type="number"
                                        step="1000"
                                        className="w-full p-1 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter override amount"
                                        value={disposition.services_amount_override ?? ''}
                                        onChange={e => setDisposition(prev => ({ ...prev, services_amount_override: e.target.value === '' ? undefined : Number(e.target.value) }))}
                                    />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="forecast-category-override" className="block text-xs font-medium text-slate-600">SA Adjusted Category</label>
                                <div className="mt-1 flex items-center text-sm">
                                     <span className="text-slate-500 mr-2">SFDC Category: {opportunity.opportunities_forecast_category}</span>
                                     <select
                                        id="forecast-category-override"
                                        className="w-full p-1 bg-white border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                                        value={disposition.forecast_category_override ?? ''}
                                        onChange={e => setDisposition(prev => ({ ...prev, forecast_category_override: e.target.value === '' ? undefined : e.target.value }))}
                                     >
                                        <option value="">Use SFDC Category</option>
                                        {FORECAST_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                     </select>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div>
                    <label htmlFor="notes" className="block text-sm font-medium text-slate-700 mb-2">General Notes</label>
                    <textarea
                        id="notes"
                        rows={disposition.status === 'No Action Needed' ? 6 : 8}
                        className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                        placeholder="e.g., Customer is planning a major migration from Salesforce Classic to Lightning..."
                        value={disposition.notes}
                        onChange={e => setDisposition(prev => ({ ...prev, notes: e.target.value }))}
                    />
                </div>
            </div>

            {/* Right Side: Action Items */}
            <div className={`space-y-4 transition-opacity duration-300 ${disposition.status === 'Services Fit' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                 <div>
                    <label htmlFor="action-item" className="block text-sm font-medium text-slate-700 mb-2">Action Items</label>
                    <form onSubmit={handleActionItemAdd} className="flex space-x-2">
                        <input
                            type="text"
                            id="action-item"
                            className="flex-grow p-2 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Add a new task..."
                            value={newActionText}
                            onChange={e => setNewActionText(e.target.value)}
                        />
                        <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-semibold transition">Add</button>
                    </form>
                </div>
                <div className="space-y-2 h-72 overflow-y-auto pr-2 border rounded-md p-2 bg-slate-50">
                    {disposition.actionItems.length === 0 && (
                        <div className="text-center py-10 text-slate-400 text-sm">No action items yet.</div>
                    )}
                    {disposition.actionItems.map(item => (
                        <div key={item.id} className="p-2 bg-white rounded-md shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={item.status === ActionItemStatus.Completed}
                                        onChange={() => handleActionItemChange(item.id, 'status', item.status === ActionItemStatus.Completed ? ActionItemStatus.NotStarted : ActionItemStatus.Completed)}
                                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className={`ml-3 text-sm ${item.status === ActionItemStatus.Completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                        {item.name}
                                    </span>
                                </div>
                                <div className="flex items-center space-x-2">
                                     <button onClick={() => setEditingItemId(editingItemId === item.id ? null : item.id)} className="text-slate-400 hover:text-indigo-600">
                                        {ICONS.edit}
                                    </button>
                                    <button onClick={() => handleActionItemDelete(item.id)} className="text-slate-400 hover:text-red-500">
                                        {ICONS.trash}
                                    </button>
                                </div>
                            </div>
                            {editingItemId === item.id && (
                                <div className="mt-3 pt-3 border-t animate-fade-in space-y-3">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-medium text-slate-600">Status</label>
                                            <select 
                                                value={item.status} 
                                                onChange={(e) => handleActionItemChange(item.id, 'status', e.target.value)}
                                                className="mt-1 w-full p-1 text-sm border border-slate-300 rounded-md"
                                            >
                                                {Object.values(ActionItemStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-slate-600">Due Date</label>
                                            <input 
                                                type="date" 
                                                value={item.dueDate}
                                                onChange={(e) => handleActionItemChange(item.id, 'dueDate', e.target.value)}
                                                className="mt-1 w-full p-1 text-sm border border-slate-300 rounded-md"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-slate-600">Notes</label>
                                        <textarea 
                                            rows={2}
                                            value={item.notes}
                                            onChange={(e) => handleActionItemChange(item.id, 'notes', e.target.value)}
                                            className="w-full p-1 text-sm border border-slate-300 rounded-md mt-1"
                                            placeholder="Add notes..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-slate-600">Relevant Documents</label>
                                        {item.documents?.map((doc, index) => (
                                          <div key={doc.id} className="flex items-center space-x-2 bg-slate-50 p-2 rounded">
                                              <input
                                                  type="text"
                                                  placeholder="Link Text"
                                                  value={doc.text}
                                                  onChange={e => handleDocumentChange(item.id, doc.id, 'text', e.target.value)}
                                                  className="w-1/3 p-1 text-xs border border-slate-300 rounded-md"
                                              />
                                               <input
                                                  type="text"
                                                  placeholder="URL"
                                                  value={doc.url}
                                                  onChange={e => handleDocumentChange(item.id, doc.id, 'url', e.target.value)}
                                                  className="flex-grow p-1 text-xs border border-slate-300 rounded-md"
                                              />
                                              <button onClick={() => handleDocumentDelete(item.id, doc.id)} className="text-slate-400 hover:text-red-500 p-1">
                                                  {ICONS.trash}
                                              </button>
                                          </div>
                                        ))}
                                        <button onClick={() => handleDocumentAdd(item.id)} className="w-full text-xs text-center p-1 mt-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md font-semibold">
                                          + Add Document
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
        <div className="p-4 bg-slate-50 border-t flex justify-end">
            <button 
                onClick={handleSubmit} 
                disabled={disposition.status === 'Not Reviewed'}
                className="px-6 py-2 bg-indigo-700 text-white font-bold rounded-md hover:bg-indigo-800 shadow transition-all disabled:bg-slate-400 disabled:cursor-not-allowed"
            >
                Save Disposition
            </button>
        </div>
    </div>
  );
};

export default DispositionForm;