import React, { useState, useMemo } from 'react';
import { Opportunity, FilterGroup, FilterRule, FilterField, FilterOperator, FilterCombinator } from '../types';
import { ICONS, FORECAST_CATEGORIES, DISPOSITION_STATUSES } from '../constants';

interface AdvancedFilterBuilderProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (filters: FilterGroup) => void;
    initialFilters: FilterGroup;
}

const OPPORTUNITY_FIELDS: { 
    value: FilterField; 
    label: string; 
    type: 'text' | 'number' | 'date' | 'select';
    options?: readonly string[];
}[] = [
    { value: 'accounts_salesforce_account_name', label: 'Account Name', type: 'text' },
    { value: 'opportunities_name', label: 'Opportunity Name', type: 'text' },
    { value: 'opportunities_owner_name', label: 'Owner Name', type: 'text' },
    { value: 'opportunities_type', label: 'Opportunity Type', type: 'text' },
    { value: 'opportunities_stage_name', label: 'Stage', type: 'text' },
    { value: 'opportunities_amount', label: 'Total Opp Amount', type: 'number' },
    { value: 'opportunities_incremental_bookings', label: 'Incr. Bookings', type: 'number' },
    { value: 'opportunities_amount_services', label: 'Services Amount', type: 'number' },
    { value: 'opportunities_close_date', label: 'Close Date', type: 'date' },
    { value: 'opportunities_has_services_flag', label: 'Services Attached', type: 'select', options: ['Yes', 'No'] },
    // --- New Filterable Fields ---
    { value: 'disposition.status', label: 'Disposition Status', type: 'select', options: DISPOSITION_STATUSES },
    { value: 'opportunities_forecast_category', label: 'SFDC Forecast Category', type: 'select', options: FORECAST_CATEGORIES },
    { value: 'disposition.forecast_category_override', label: 'SA Forecast Category', type: 'select', options: FORECAST_CATEGORIES },
    // --- Expanded non-visible fields ---
    { value: 'opportunities_manager_of_opp_email', label: 'Manager Email', type: 'text' },
    { value: 'accounts_se_territory_owner_email', label: 'SE Owner Email', type: 'text' },
    { value: 'opportunities_product_being_pitched', label: 'Product Pitched', type: 'text' },
    { value: 'opportunities_connectors', label: 'Connectors', type: 'text' },
];

const OPERATORS: { [key: string]: { value: FilterOperator; label: string }[] } = {
    text: [
        { value: 'contains', label: 'contains' },
        { value: 'not_contains', label: 'does not contain' },
        { value: 'equals', label: 'equals' },
        { value: 'not_equals', label: 'does not equal' },
    ],
    number: [
        { value: 'eq', label: '=' },
        { value: 'neq', label: '!=' },
        { value: 'gt', label: '>' },
        { value: 'gte', label: '>=' },
        { value: 'lt', label: '<' },
        { value: 'lte', label: '<=' },
    ],
    date: [
        { value: 'on', label: 'is on' },
        { value: 'before', label: 'is before' },
        { value: 'after', label: 'is after' },
    ],
    select: [
        { value: 'is', label: 'is' },
        { value: 'is_not', label: 'is not' },
    ]
};

const FilterRuleComponent: React.FC<{ rule: FilterRule; onChange: (rule: FilterRule) => void; onDelete: () => void; }> = ({ rule, onChange, onDelete }) => {
    const selectedField = useMemo(() => OPPORTUNITY_FIELDS.find(f => f.value === rule.field), [rule.field]);
    const availableOperators = selectedField ? OPERATORS[selectedField.type] : [];

    const handleFieldChange = (field: FilterField) => {
        const newField = OPPORTUNITY_FIELDS.find(f => f.value === field);
        if (newField) {
            const newOperator = OPERATORS[newField.type][0].value;
            onChange({ ...rule, field, operator: newOperator, value: '' });
        }
    };

    const renderValueInput = () => {
        if (!selectedField) return null;
        switch (selectedField.type) {
            case 'number':
                return <input type="number" value={rule.value} onChange={e => onChange({ ...rule, value: e.target.value })} className="w-full p-1 border border-slate-300 rounded-md shadow-sm text-sm" />;
            case 'date':
                return <input type="date" value={rule.value} onChange={e => onChange({ ...rule, value: e.target.value })} className="w-full p-1 border border-slate-300 rounded-md shadow-sm text-sm" />;
            case 'select':
                return (
                    <select value={rule.value} onChange={e => onChange({ ...rule, value: e.target.value })} className="w-full p-1 border border-slate-300 rounded-md shadow-sm text-sm bg-white">
                        <option value="">Select...</option>
                        {selectedField.options?.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                );
            default: // text
                return <input type="text" value={rule.value} onChange={e => onChange({ ...rule, value: e.target.value })} className="w-full p-1 border border-slate-300 rounded-md shadow-sm text-sm" />;
        }
    };

    return (
        <div className="flex items-center space-x-2">
            <select value={rule.field} onChange={e => handleFieldChange(e.target.value as FilterField)} className="w-48 p-1 border border-slate-300 rounded-md shadow-sm text-sm bg-white">
                {OPPORTUNITY_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <select value={rule.operator} onChange={e => onChange({ ...rule, operator: e.target.value as FilterOperator })} className="w-32 p-1 border border-slate-300 rounded-md shadow-sm text-sm bg-white">
                {availableOperators.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
            </select>
            <div className="flex-grow">{renderValueInput()}</div>
            <button onClick={onDelete} className="text-slate-400 hover:text-red-500 p-1">{ICONS.trash}</button>
        </div>
    );
};


const FilterGroupComponent: React.FC<{ group: FilterGroup; onChange: (group: FilterGroup) => void; onDelete?: () => void; isRoot?: boolean; }> = ({ group, onChange, onDelete, isRoot = false }) => {

    const handleCombinatorChange = (combinator: FilterCombinator) => {
        onChange({ ...group, combinator });
    };

    const handleAddRule = () => {
        const newRule: FilterRule = {
            id: `rule-${Date.now()}`,
            field: 'accounts_salesforce_account_name',
            operator: 'contains',
            value: ''
        };
        onChange({ ...group, rules: [...group.rules, newRule] });
    };

    const handleAddGroup = () => {
        const newGroup: FilterGroup = {
            id: `group-${Date.now()}`,
            combinator: 'AND',
            rules: []
        };
        onChange({ ...group, rules: [...group.rules, newGroup] });
    };

    const handleRuleChange = (index: number, updatedRule: FilterRule | FilterGroup) => {
        const newRules = [...group.rules];
        newRules[index] = updatedRule;
        onChange({ ...group, rules: newRules });
    };

    const handleRuleDelete = (index: number) => {
        onChange({ ...group, rules: group.rules.filter((_, i) => i !== index) });
    };


    return (
        <div className={`p-3 rounded-md ${isRoot ? '' : 'bg-slate-100 border border-slate-200'}`}>
            <div className="flex items-center mb-2 space-x-4">
                <div className="flex items-center space-x-1 bg-slate-200 rounded-md p-0.5">
                    <button onClick={() => handleCombinatorChange('AND')} className={`px-2 py-0.5 text-xs font-bold rounded ${group.combinator === 'AND' ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}>AND</button>
                    <button onClick={() => handleCombinatorChange('OR')} className={`px-2 py-0.5 text-xs font-bold rounded ${group.combinator === 'OR' ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}>OR</button>
                </div>
                {/* Show a small badge if this group was created via the Sales Org Chart flow */}
                {!isRoot && group.id?.toString().startsWith('org-') && (
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">Org Chart</span>
                )}
                <div className="flex-grow"></div>
                {!isRoot && <button onClick={onDelete} className="text-slate-400 hover:text-red-500 p-1">{ICONS.trash}</button>}
            </div>
            <div className="space-y-2 pl-4 border-l-2 border-slate-300">
                 {group.rules.map((rule, index) => (
                    'combinator' in rule
                        ? <FilterGroupComponent key={rule.id} group={rule} onChange={(g) => handleRuleChange(index, g)} onDelete={() => handleRuleDelete(index)} />
                        : <FilterRuleComponent key={rule.id} rule={rule} onChange={(r) => handleRuleChange(index, r)} onDelete={() => handleRuleDelete(index)} />
                ))}
                <div className="pt-2 flex items-center space-x-2">
                    <button onClick={handleAddRule} className="px-2 py-1 bg-white text-indigo-600 border border-indigo-200 rounded-md hover:bg-indigo-50 text-xs font-semibold">+ Add Rule</button>
                    <button onClick={handleAddGroup} className="px-2 py-1 bg-white text-indigo-600 border border-indigo-200 rounded-md hover:bg-indigo-50 text-xs font-semibold">+ Add Group</button>
                </div>
            </div>
        </div>
    );
};



const AdvancedFilterBuilder: React.FC<AdvancedFilterBuilderProps> = ({ isOpen, onClose, onApply, initialFilters }) => {
    const [filters, setFilters] = useState<FilterGroup>(initialFilters);

    const handleApply = () => {
        onApply(filters);
    };
    
    const handleClear = () => {
        setFilters({ id: 'root', combinator: 'AND', rules: [] });
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-start pt-16" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl m-4 animate-fade-in-up" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b flex justify-between items-center">
                    <h2 className="text-lg font-bold text-slate-800">Advanced Filter Builder</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">{ICONS.xMark}</button>
                </div>
                <div className="p-4 max-h-[60vh] overflow-y-auto">
                    <FilterGroupComponent group={filters} onChange={setFilters} isRoot />
                </div>
                <div className="p-4 bg-slate-50 border-t flex justify-between">
                    <button onClick={handleClear} className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 font-semibold">
                        Clear All
                    </button>
                    <div className="flex space-x-2">
                        <button onClick={onClose} className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 font-semibold">
                            Cancel
                        </button>
                        <button onClick={handleApply} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-semibold">
                            Apply Filters
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdvancedFilterBuilder;
