
import React, { useMemo, useState } from 'react';
import type { ActionItem, User } from '../types';
import { ActionItemStatus } from '../types';
import { ICONS } from '../constants';

type StagedItem = { name: string; status: ActionItemStatus; due_date: string; notes: string };

interface ActionItemsManagerProps {
    opportunityId: string;
    actionItems: ActionItem[];
    users: User[];
    currentUser: User;
    onCreate: (opportunityId: string, item: Omit<ActionItem, 'action_item_id' | 'created_by_user_id'>) => void;
    onUpdate: (opportunityId: string, itemId: string, updates: Partial<ActionItem>) => void;
    onDelete: (opportunityId: string, itemId: string) => void;
    isDispositioned: boolean;
    stagedDefaults?: StagedItem[];
    onStageChange?: (index: number, updates: Partial<StagedItem>) => void;
    onStageRemove?: (index: number) => void;
    onStageAdd?: (item: StagedItem) => void;
    onStagePersist?: () => void;
    isStagePersisting?: boolean;
}

const ActionItemsManager: React.FC<ActionItemsManagerProps> = ({
    opportunityId,
    actionItems,
    users,
    currentUser,
    onCreate,
    onUpdate,
    onDelete,
    isDispositioned,
    stagedDefaults,
    onStageChange,
    onStageRemove,
    onStageAdd,
    onStagePersist,
    isStagePersisting
}) => {
    const [newActionText, setNewActionText] = useState('');
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [expandedStagedIdx, setExpandedStagedIdx] = useState<number | null>(null);

    const handleActionItemAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (newActionText.trim()) {
            // If we're staging defaults (pre-save), add to staged list instead of persisting
            if (stagedDefaults && onStageAdd && (actionItems?.length || 0) === 0) {
                // Append staged item and expand it for editing
                onStageAdd({ name: newActionText.trim(), status: ActionItemStatus.NotStarted, due_date: '', notes: '' });
                setEditingItemId(null);
                setExpandedStagedIdx((stagedDefaults?.length || 0));
            } else {
                const newAction: Omit<ActionItem, 'action_item_id' | 'created_by_user_id'> = {
                    opportunity_id: opportunityId,
                    name: newActionText.trim(),
                    status: ActionItemStatus.NotStarted,
                    due_date: '',
                    notes: '',
                    documents: [],
                    assigned_to_user_id: currentUser.user_id,
                };
                onCreate(opportunityId, newAction);
            }
            setNewActionText('');
        }
    };

    const handleUpdate = (itemId: string, updates: Partial<ActionItem>) => {
        onUpdate(opportunityId, itemId, updates);
    };

    const renderActionItem = (item: ActionItem) => {
        const isEditing = editingItemId === item.action_item_id;
        const createdBy = users.find(u => u.user_id === item.created_by_user_id)?.name || 'Unknown';

        return (
            <div key={item.action_item_id} className="p-3 bg-white rounded-md shadow-sm border">
                <div className="flex items-center justify-between">
                    <div className="flex items-center flex-grow min-w-0">
                        <input
                            type="checkbox"
                            checked={item.status === ActionItemStatus.Completed}
                            onChange={() => handleUpdate(item.action_item_id, { status: item.status === ActionItemStatus.Completed ? ActionItemStatus.NotStarted : ActionItemStatus.Completed })}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                        />
                        <span className={`ml-3 text-sm font-medium ${item.status === ActionItemStatus.Completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                            {item.name}
                        </span>
                    </div>
                    <div className="flex items-center space-x-2">
                         <button
                            onClick={() => {
                                setExpandedStagedIdx(null);
                                setEditingItemId(isEditing ? null : item.action_item_id);
                            }}
                            className="text-slate-400 hover:text-indigo-600 p-1"
                         >{ICONS.edit}</button>
                         <button onClick={() => onDelete(opportunityId, item.action_item_id)} className="text-slate-400 hover:text-red-500 p-1">{ICONS.trash}</button>
                    </div>
                </div>
                 {isEditing && (
                    <div className="mt-3 pt-3 border-t animate-fade-in space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="text-xs font-medium text-slate-600">Status</label>
                                <select value={item.status} onChange={(e) => handleUpdate(item.action_item_id, { status: e.target.value as ActionItemStatus })} className="mt-1 w-full p-1 text-sm border-slate-300 rounded-md">
                                    {Object.values(ActionItemStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600">Assign To</label>
                                <select value={item.assigned_to_user_id} onChange={(e) => handleUpdate(item.action_item_id, { assigned_to_user_id: e.target.value })} className="mt-1 w-full p-1 text-sm border-slate-300 rounded-md">
                                    {users.map(user => <option key={user.user_id} value={user.user_id}>{user.name}</option>)}
                                </select>
                            </div>
                             <div>
                                <label className="text-xs font-medium text-slate-600">Due Date</label>
                                <input type="date" value={item.due_date} onChange={(e) => handleUpdate(item.action_item_id, { due_date: e.target.value })} className="mt-1 w-full p-1 text-sm border-slate-300 rounded-md" />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-600">Notes</label>
                            <textarea rows={2} value={item.notes || ''} onChange={(e) => handleUpdate(item.action_item_id, { notes: e.target.value })} className="w-full p-1 text-sm border-slate-300 rounded-md mt-1" placeholder="Add notes..."/>
                        </div>
                        <p className="text-right text-xs text-slate-400">Created by: {createdBy}</p>
                    </div>
                 )}
            </div>
        );
    };

    const DEFAULT_ORDER = useMemo(() => new Map<string, number>([
        ['contact opp owner', 0],
        ['scope and develop proposal', 1],
        ['share proposal', 2],
        ['finalize proposal', 3],
        ['ironclad approvals', 4],
        ['ironclad approval', 4],
    ]), []);

    const displayed = useMemo(() => {
        const items = [...actionItems];
        items.sort((a, b) => {
            const ai = DEFAULT_ORDER.get((a.name || '').trim().toLowerCase());
            const bi = DEFAULT_ORDER.get((b.name || '').trim().toLowerCase());
            if (ai !== undefined && bi !== undefined) return ai - bi;
            if (ai !== undefined) return -1;
            if (bi !== undefined) return 1;
            return 0;
        });
        return items;
    }, [actionItems, DEFAULT_ORDER]);

    const renderStagedItem = (item: StagedItem, idx: number) => {
        const expanded = expandedStagedIdx === idx;
        return (
            <div key={`staged-${idx}`} className="p-3 bg-white rounded-md shadow-sm border border-dashed">
                <div className="flex items-center justify-between">
                    <div className="flex items-center flex-grow min-w-0">
                        <input type="checkbox" disabled className="h-4 w-4 rounded border-slate-300 text-indigo-600 flex-shrink-0" />
                        {expanded ? (
                            <input
                                type="text"
                                value={item.name}
                                onChange={(e) => onStageChange && onStageChange(idx, { name: e.target.value })}
                                className="ml-3 flex-grow min-w-0 p-1 text-sm border border-slate-300 rounded-md"
                                placeholder="Task title"
                            />
                        ) : (
                            <span className="ml-3 text-sm font-medium text-slate-800 truncate">{item.name}</span>
                        )}
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            type="button"
                            onClick={() => {
                                setEditingItemId(null);
                                setExpandedStagedIdx(expanded ? null : idx);
                            }}
                            className="text-slate-400 hover:text-indigo-600 p-1"
                            title={expanded ? 'Collapse' : 'Edit'}
                        >
                            {ICONS.edit}
                        </button>
                        {onStageRemove && (
                            <button type="button" onClick={() => onStageRemove(idx)} className="text-slate-400 hover:text-red-500 p-1" title="Remove">
                                {ICONS.trash}
                            </button>
                        )}
                        <span className="text-xs text-slate-500">Pending save</span>
                    </div>
                </div>
                {expanded && (
                    <div className="mt-3 pt-3 border-t grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="text-xs font-medium text-slate-600">Status</label>
                            <select
                                value={item.status}
                                onChange={(e) => onStageChange && onStageChange(idx, { status: e.target.value as ActionItemStatus })}
                                className="mt-1 w-full p-1 text-sm border-slate-300 rounded-md"
                            >
                                {Object.values(ActionItemStatus).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-600">Due Date</label>
                            <input
                                type="date"
                                value={item.due_date}
                                onChange={(e) => onStageChange && onStageChange(idx, { due_date: e.target.value })}
                                className="mt-1 w-full p-1 text-sm border-slate-300 rounded-md"
                            />
                        </div>
                        <div className="sm:col-span-3">
                            <label className="text-xs font-medium text-slate-600">Notes</label>
                            <textarea
                                rows={2}
                                value={item.notes}
                                onChange={(e) => onStageChange && onStageChange(idx, { notes: e.target.value })}
                                className="w-full p-1 text-sm border-slate-300 rounded-md mt-1"
                                placeholder="Add notes..."
                            />
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="bg-white rounded-lg shadow-lg">
            <div className="p-4 bg-slate-50 border-b flex items-center space-x-3">
                {ICONS.listBullet}
                <h3 className="text-lg font-semibold text-slate-700">Action Plan</h3>
            </div>
            <div className={`p-6 space-y-4 transition-opacity duration-300 ${isDispositioned ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                {stagedDefaults && stagedDefaults.length > 0 && (
                    <div className="p-4 border border-indigo-300 bg-indigo-50 rounded-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold text-indigo-900">Action plan staged</p>
                            <p className="text-xs text-indigo-700">Review the pending tasks below, then save them to add to the action plan.</p>
                        </div>
                        {onStagePersist && (
                            <button
                                type="button"
                                onClick={onStagePersist}
                                className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-md shadow hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                disabled={isStagePersisting}
                            >
                                {isStagePersisting ? 'Saving…' : 'Save Action Plan'}
                            </button>
                        )}
                    </div>
                )}
                <div>
                    <form onSubmit={handleActionItemAdd} className="flex space-x-2">
                        <input
                            type="text"
                            className="flex-grow p-2 border border-slate-300 rounded-md shadow-sm"
                            placeholder="Add a new task..."
                            value={newActionText}
                            onChange={e => setNewActionText(e.target.value)}
                            disabled={!isDispositioned}
                        />
                        <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-semibold" disabled={!isDispositioned}>Add</button>
                    </form>
                </div>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {stagedDefaults && stagedDefaults.length > 0 && stagedDefaults.map(renderStagedItem)}
                    {(!stagedDefaults || stagedDefaults.length === 0) && displayed.length === 0 && (
                        <div className="text-center py-10 text-slate-400 text-sm">
                            <p>No action items yet.</p>
                            <p>Set disposition to "Services Fit" to add tasks.</p>
                        </div>
                    )}
                    {displayed.map(renderActionItem)}
                </div>
            </div>
        </div>
    );
};

export default ActionItemsManager;
