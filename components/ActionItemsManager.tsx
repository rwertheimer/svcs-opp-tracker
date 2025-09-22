import React, { useMemo, useState } from 'react';
import type { User } from '../types';
import { ActionItemStatus } from '../types';
import { ICONS } from '../constants';
import { useDispositionActionPlan } from './disposition/DispositionActionPlanContext';
import { getDueDateColorClasses, getDueDateDescriptor } from './disposition/dateUtils';

interface ActionItemsManagerProps {
    users: User[];
}

const DEFAULT_ORDER = new Map<string, number>([
    ['contact opp owner', 0],
    ['scope and develop proposal', 1],
    ['share proposal', 2],
    ['finalize proposal', 3],
    ['ironclad approvals', 4],
    ['ironclad approval', 4],
]);

const ActionItemsManager: React.FC<ActionItemsManagerProps> = ({ users }) => {
    const {
        isDispositioned,
        actionItems,
        stagedActionItems,
        addStagedActionItem,
        updateStagedActionItem,
        removeStagedActionItem,
        updateActionItem,
        deleteActionItem,
        isStagePersisting,
        currentUser,
    } = useDispositionActionPlan();
    const [newActionText, setNewActionText] = useState('');

    const sortedActionItems = useMemo(() => {
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
    }, [actionItems]);

    const disableInteractions = !isDispositioned || isStagePersisting;

    const handleActionItemAdd = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = newActionText.trim();
        if (!trimmed || disableInteractions) return;

        addStagedActionItem({ name: trimmed });
        setNewActionText('');
    };

    const renderDueDescriptor = (identifier: string, dueDate: string | null | undefined) => {
        const descriptor = getDueDateDescriptor(dueDate);
        return (
            <span
                id={identifier}
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${getDueDateColorClasses(
                    dueDate
                )}`}
            >
                {descriptor}
            </span>
        );
    };

    const renderPersistedItem = (index: number) => {
        const item = sortedActionItems[index];
        const createdBy = users.find(u => u.user_id === item.created_by_user_id)?.name || 'Unknown';
        const dueDescriptorId = `persisted-${item.action_item_id}-due`;

        return (
            <article key={item.action_item_id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-1 items-start gap-3">
                        <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 flex-shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            checked={item.status === ActionItemStatus.Completed}
                            onChange={() =>
                                updateActionItem(item.action_item_id, {
                                    status:
                                        item.status === ActionItemStatus.Completed
                                            ? ActionItemStatus.NotStarted
                                            : ActionItemStatus.Completed,
                                })
                            }
                            disabled={disableInteractions}
                            aria-label={item.status === ActionItemStatus.Completed ? 'Mark task incomplete' : 'Mark task complete'}
                        />
                        <div className="min-w-0 flex-1">
                            <p
                                className={`text-sm font-semibold ${
                                    item.status === ActionItemStatus.Completed ? 'line-through text-slate-400' : 'text-slate-800'
                                }`}
                            >
                                {item.name}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span>Created by {createdBy}</span>
                                {renderDueDescriptor(dueDescriptorId, item.due_date)}
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => deleteActionItem(item.action_item_id)}
                        className="inline-flex items-center rounded-md p-1 text-slate-400 transition hover:text-red-600"
                        aria-label={`Delete task ${item.name}`}
                        disabled={isStagePersisting}
                    >
                        {ICONS.trash}
                    </button>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="flex flex-col text-xs font-medium text-slate-600">
                        <span>Status</span>
                        <select
                            value={item.status}
                            onChange={event =>
                                updateActionItem(item.action_item_id, {
                                    status: event.target.value as ActionItemStatus,
                                })
                            }
                            className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                            disabled={disableInteractions}
                        >
                            {Object.values(ActionItemStatus).map(status => (
                                <option key={status} value={status}>
                                    {status}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col text-xs font-medium text-slate-600">
                        <span>Assignee</span>
                        <select
                            value={item.assigned_to_user_id}
                            onChange={event =>
                                updateActionItem(item.action_item_id, {
                                    assigned_to_user_id: event.target.value,
                                })
                            }
                            className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                            disabled={disableInteractions}
                        >
                            {users.map(user => (
                                <option key={user.user_id} value={user.user_id}>
                                    {user.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col text-xs font-medium text-slate-600">
                        <span>Due date</span>
                        <input
                            type="date"
                            value={item.due_date || ''}
                            onChange={event =>
                                updateActionItem(item.action_item_id, {
                                    due_date: event.target.value,
                                })
                            }
                            className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                            aria-describedby={dueDescriptorId}
                            disabled={disableInteractions}
                        />
                    </label>
                    <label className="flex flex-col text-xs font-medium text-slate-600 sm:col-span-2 lg:col-span-1">
                        <span>Notes</span>
                        <textarea
                            value={item.notes || ''}
                            onChange={event =>
                                updateActionItem(item.action_item_id, {
                                    notes: event.target.value,
                                })
                            }
                            rows={2}
                            className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                            placeholder="Add notes"
                            disabled={disableInteractions}
                        />
                    </label>
                </div>
            </article>
        );
    };

    const renderStagedItem = (index: number) => {
        const item = stagedActionItems[index];
        const dueDescriptorId = `staged-${index}-due`;

        return (
            <article
                key={`staged-${index}`}
                className="rounded-md border border-dashed border-indigo-300 bg-indigo-50/80 p-4 shadow-sm"
            >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-1 items-start gap-3">
                        <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 flex-shrink-0 rounded border-slate-300"
                            disabled
                            aria-label="Unsaved task"
                        />
                        <div className="min-w-0 flex-1">
                            <input
                                type="text"
                                value={item.name}
                                onChange={event => updateStagedActionItem(index, { name: event.target.value })}
                                className="w-full rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                placeholder="Task title"
                                disabled={disableInteractions}
                            />
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-indigo-700">
                                <span className="inline-flex items-center rounded-full bg-indigo-200/70 px-2 py-0.5 font-semibold text-indigo-900">
                                    Unsaved task – save changes to persist
                                </span>
                                {renderDueDescriptor(dueDescriptorId, item.due_date)}
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => removeStagedActionItem(index)}
                        className="inline-flex items-center rounded-md p-1 text-indigo-500 transition hover:text-red-600"
                        aria-label={`Remove unsaved task ${item.name || index + 1}`}
                        disabled={disableInteractions}
                    >
                        {ICONS.trash}
                    </button>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="flex flex-col text-xs font-medium text-slate-600">
                        <span>Status</span>
                        <select
                            value={item.status}
                            onChange={event =>
                                updateStagedActionItem(index, {
                                    status: event.target.value as ActionItemStatus,
                                })
                            }
                            className="mt-1 w-full rounded-md border border-indigo-200 bg-white p-2 text-sm"
                            disabled={disableInteractions}
                        >
                            {Object.values(ActionItemStatus).map(status => (
                                <option key={status} value={status}>
                                    {status}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col text-xs font-medium text-slate-600">
                        <span>Assignee</span>
                        <select
                            value={item.assigned_to_user_id || currentUser.user_id}
                            onChange={event =>
                                updateStagedActionItem(index, {
                                    assigned_to_user_id: event.target.value,
                                })
                            }
                            className="mt-1 w-full rounded-md border border-indigo-200 bg-white p-2 text-sm"
                            disabled={disableInteractions}
                        >
                            {users.map(user => (
                                <option key={user.user_id} value={user.user_id}>
                                    {user.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col text-xs font-medium text-slate-600">
                        <span>Due date</span>
                        <input
                            type="date"
                            value={item.due_date || ''}
                            onChange={event => updateStagedActionItem(index, { due_date: event.target.value })}
                            className="mt-1 w-full rounded-md border border-indigo-200 bg-white p-2 text-sm"
                            aria-describedby={dueDescriptorId}
                            disabled={disableInteractions}
                        />
                    </label>
                    <label className="flex flex-col text-xs font-medium text-slate-600 sm:col-span-2 lg:col-span-1">
                        <span>Notes</span>
                        <textarea
                            value={item.notes}
                            onChange={event => updateStagedActionItem(index, { notes: event.target.value })}
                            rows={2}
                            className="mt-1 w-full rounded-md border border-indigo-200 bg-white p-2 text-sm"
                            placeholder="Add notes"
                            disabled={disableInteractions}
                        />
                    </label>
                </div>
            </article>
        );
    };

    return (
        <section className="rounded-lg bg-white shadow-lg" aria-labelledby="action-plan-heading">
            <div className="flex items-center space-x-3 border-b bg-slate-50 p-4">
                {ICONS.listBullet}
                <h3 id="action-plan-heading" className="text-lg font-semibold text-slate-700">
                    Action plan
                </h3>
            </div>
            <div
                className={`space-y-4 p-6 transition-opacity duration-300 ${
                    isDispositioned ? 'opacity-100' : 'opacity-40 pointer-events-none'
                }`}
            >
                {stagedActionItems.length > 0 && (
                    <div className="flex flex-col gap-3 rounded-md border border-indigo-200 bg-indigo-50/90 p-4 text-sm text-indigo-900 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="font-semibold">Unsaved action plan tasks</p>
                            <p className="text-xs text-indigo-700">
                                Review tasks and press Save changes above to add them to this opportunity.
                            </p>
                        </div>
                        {isStagePersisting && (
                            <span className="inline-flex items-center rounded-full bg-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-900">
                                Saving…
                            </span>
                        )}
                    </div>
                )}
                <form onSubmit={handleActionItemAdd} className="flex flex-col gap-2 sm:flex-row">
                    <label className="flex-1 text-sm text-slate-600">
                        <span className="sr-only">New task name</span>
                        <input
                            type="text"
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            placeholder="Add a new task"
                            value={newActionText}
                            onChange={event => setNewActionText(event.target.value)}
                            disabled={!isDispositioned || isStagePersisting}
                        />
                    </label>
                    <button
                        type="submit"
                        className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                        disabled={!isDispositioned || isStagePersisting || newActionText.trim().length === 0}
                    >
                        Add task
                    </button>
                </form>
                <div className="space-y-4" aria-live="polite">
                    {stagedActionItems.map((_, index) => renderStagedItem(index))}
                    {sortedActionItems.length === 0 && stagedActionItems.length === 0 ? (
                        <div className="rounded-md border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
                            <p>No action items yet.</p>
                            <p className="mt-1">Set disposition to “Services Fit” to start building an action plan.</p>
                        </div>
                    ) : (
                        sortedActionItems.map((_, index) => renderPersistedItem(index))
                    )}
                </div>
            </div>
        </section>
    );
};

export default ActionItemsManager;
