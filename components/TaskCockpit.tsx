
import React, { useState, useMemo } from 'react';
import type { TaskWithOpportunityContext, ActionItem, User } from '../types';
import { ActionItemStatus } from '../types';
import { ICONS } from '../constants';
import { getDueDateColorClasses, getDueDateDescriptor } from './disposition/dateUtils';

interface TaskCockpitProps {
    tasks: TaskWithOpportunityContext[];
    onTaskUpdate: (taskId: string, opportunityId: string, updates: Partial<ActionItem>) => void;
    onSelectOpportunity: (opportunityId: string) => void;
    users: User[];
    currentUser: User;
}

const TaskCockpit: React.FC<TaskCockpitProps> = ({ tasks, onTaskUpdate, onSelectOpportunity, users, currentUser }) => {
    const [viewMode, setViewMode] = useState<'date' | 'opportunity'>('date');

    const sortedTasksByDate = useMemo(() => {
        return [...tasks].sort((a, b) => {
            if (!a.due_date && !b.due_date) return 0;
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        });
    }, [tasks]);

    const groupedTasksByOpportunity = useMemo(() => {
        const grouped: { [key: string]: TaskWithOpportunityContext[] } = {};
        sortedTasksByDate.forEach(task => {
            const key = `${task.opportunityName} | ${task.accountName}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(task);
        });
        return grouped;
    }, [sortedTasksByDate]);
    
    const getAssigneeName = (userId: string) => users.find(u => u.user_id === userId)?.name || 'Unknown';

    const renderTaskItem = (task: TaskWithOpportunityContext) => {
        const dueDescriptor = getDueDateDescriptor(task.due_date);
        const dueClasses = getDueDateColorClasses(task.due_date);

        return (
            <div key={task.action_item_id} className="p-3 bg-white rounded-md shadow-sm border border-slate-200">
                <div className="flex items-start justify-between space-x-4">
                    <div className="flex-grow min-w-0">
                        <p
                            className={`font-semibold text-slate-800 ${
                                task.status === ActionItemStatus.Completed ? 'line-through text-slate-400' : ''
                            }`}
                        >
                            {task.name}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            {viewMode === 'date' && (
                                <span>
                                    For:{' '}
                                    <button
                                        onClick={() => onSelectOpportunity(task.opportunityId)}
                                        className="font-semibold text-indigo-600 hover:underline"
                                    >
                                        {task.opportunityName}
                                    </button>{' '}
                                    ({task.accountName})
                                </span>
                            )}
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${dueClasses}`}>
                                {dueDescriptor}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center space-x-4 flex-shrink-0">
                        <div className="flex items-center space-x-2">
                            <span className="text-xs text-slate-500">Assignee:</span>
                            <select
                                value={task.assigned_to_user_id}
                                onChange={event =>
                                    onTaskUpdate(task.action_item_id, task.opportunityId, {
                                        assigned_to_user_id: event.target.value,
                                    })
                                }
                                className="text-sm p-1 border border-slate-300 rounded-md bg-white w-32"
                                onClick={event => event.stopPropagation()}
                            >
                                {users.map(user => (
                                    <option key={user.user_id} value={user.user_id}>
                                        {user.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <input
                            type="date"
                            value={task.due_date}
                            onChange={event =>
                                onTaskUpdate(task.action_item_id, task.opportunityId, { due_date: event.target.value })
                            }
                            className="text-sm p-1 border border-slate-300 rounded-md bg-white hidden sm:block w-36"
                            onClick={event => event.stopPropagation()}
                        />
                        <select
                            value={task.status}
                            onChange={event =>
                                onTaskUpdate(task.action_item_id, task.opportunityId, {
                                    status: event.target.value as ActionItemStatus,
                                })
                            }
                            className="text-sm p-1 border border-slate-300 rounded-md bg-white"
                            onClick={event => event.stopPropagation()}
                        >
                            {Object.values(ActionItemStatus).map(status => (
                                <option key={status} value={status}>
                                    {status}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                {task.notes && (
                    <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                        <p className="whitespace-pre-wrap">{task.notes}</p>
                    </div>
                )}
                {task.documents && task.documents.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-100">
                        <h4 className="text-xs font-bold text-slate-500 mb-1">Documents:</h4>
                        <ul className="text-xs space-y-1">
                            {task.documents.map(doc => (
                                <li key={doc.id}>
                                    <a
                                        href={doc.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-indigo-600 hover:underline flex items-center space-x-1"
                                    >
                                        {ICONS.link}
                                        <span>{doc.text || doc.url}</span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        );
    };

    const renderGroupedView = () => (
        <div className="space-y-6">{Object.entries(groupedTasksByOpportunity).map(([groupName, tasksInGroup]) => (<div key={groupName}><h3 className="text-lg font-bold text-slate-700 mb-2 cursor-pointer hover:text-indigo-600 truncate" onClick={() => onSelectOpportunity(tasksInGroup[0].opportunityId)} title={`View: ${groupName}`}>{groupName}</h3><div className="space-y-2 pl-4 border-l-2 border-slate-200">{tasksInGroup.map(renderTaskItem)}</div></div>))}</div>
    );
    const renderDateView = () => <div className="space-y-2">{sortedTasksByDate.map(renderTaskItem)}</div>;

    return (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden animate-fade-in">
             <div className="p-4 border-b flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">My Action Items for {currentUser.name}</h2>
                    <p className="text-sm text-slate-500 mt-1">A consolidated view of all tasks assigned to you.</p>
                </div>
                <div className="flex items-center space-x-2 p-1 bg-slate-200 rounded-lg">
                    <button onClick={() => setViewMode('date')} className={`px-3 py-1 rounded-md text-sm font-semibold transition ${viewMode === 'date' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:bg-slate-300'}`}>Sort by Due Date</button>
                    <button onClick={() => setViewMode('opportunity')} className={`px-3 py-1 rounded-md text-sm font-semibold transition ${viewMode === 'opportunity' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:bg-slate-300'}`}>Group by Opportunity</button>
                </div>
            </div>
            <div className="p-4 md:p-6 bg-slate-50">
                {tasks.length === 0 ? (
                    <div className="text-center py-16 text-slate-500">
                        <div className="text-green-500 text-5xl mb-4 inline-block">{ICONS.checkCircle}</div>
                        <h3 className="text-xl font-semibold text-slate-700">All caught up!</h3>
                        <p>You have no pending action items assigned to you.</p>
                    </div>
                ) : ( viewMode === 'date' ? renderDateView() : renderGroupedView() )}
            </div>
        </div>
    );
};

export default TaskCockpit;
