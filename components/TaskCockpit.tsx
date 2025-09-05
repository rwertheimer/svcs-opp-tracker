import React, { useState, useMemo } from 'react';
import type { TaskWithOpportunityContext, ActionItem } from '../types';
import { ActionItemStatus } from '../types';
import { ICONS } from '../constants';

interface TaskCockpitProps {
    tasks: TaskWithOpportunityContext[];
    onTaskUpdate: (taskId: string, opportunityId: string, updates: Partial<ActionItem>) => void;
    onSelectOpportunity: (opportunityId: string) => void;
}

const formatDate = (dateString: string) => {
    if (!dateString) return 'No due date';
    const date = new Date(dateString);
    const utcDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    return utcDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const TaskCockpit: React.FC<TaskCockpitProps> = ({ tasks, onTaskUpdate, onSelectOpportunity }) => {
    const [viewMode, setViewMode] = useState<'date' | 'opportunity'>('date');

    const sortedTasksByDate = useMemo(() => {
        return [...tasks].sort((a, b) => {
            if (!a.dueDate && !b.dueDate) return 0;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        });
    }, [tasks]);

    const groupedTasksByOpportunity = useMemo(() => {
        const grouped: { [key: string]: TaskWithOpportunityContext[] } = {};
        sortedTasksByDate.forEach(task => {
            const key = `${task.opportunityName} | ${task.accountName}`;
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(task);
        });
        return grouped;
    }, [sortedTasksByDate]);

    const renderTaskItem = (task: TaskWithOpportunityContext) => (
        <div key={task.id} className="p-3 bg-white rounded-md shadow-sm border border-slate-200">
            <div className="flex items-start justify-between space-x-4">
                <div className="flex-grow min-w-0">
                    <p className={`font-semibold text-slate-800 ${task.status === ActionItemStatus.Completed ? 'line-through text-slate-400' : ''}`}>
                        {task.name}
                    </p>
                    {viewMode === 'date' && (
                        <p className="text-xs text-slate-500 mt-1">
                            For: <button onClick={() => onSelectOpportunity(task.opportunityId)} className="font-semibold text-indigo-600 hover:underline">{task.opportunityName}</button> ({task.accountName})
                        </p>
                    )}
                </div>
                <div className="flex items-center space-x-4 flex-shrink-0">
                    <input
                        type="date"
                        value={task.dueDate}
                        onChange={(e) => onTaskUpdate(task.id, task.opportunityId, { dueDate: e.target.value })}
                        className="text-sm p-1 border border-slate-300 rounded-md bg-white focus:ring-indigo-500 focus:border-indigo-500 hidden sm:block w-36"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <select 
                        value={task.status} 
                        onChange={(e) => onTaskUpdate(task.id, task.opportunityId, { status: e.target.value as ActionItemStatus })}
                        className="text-sm p-1 border border-slate-300 rounded-md bg-white focus:ring-indigo-500 focus:border-indigo-500"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {Object.values(ActionItemStatus).map(s => <option key={s} value={s}>{s}</option>)}
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
                    <h4 className="text-xs font-bold text-slate-500 mb-1">Relevant Documents:</h4>
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

    const renderGroupedView = () => (
        <div className="space-y-6">
            {Object.entries(groupedTasksByOpportunity).map(([groupName, tasksInGroup]) => (
                <div key={groupName}>
                     <h3 
                        className="text-lg font-bold text-slate-700 mb-2 cursor-pointer hover:text-indigo-600 truncate"
                        onClick={() => onSelectOpportunity(tasksInGroup[0].opportunityId)}
                        title={`View Opportunity: ${groupName}`}
                     >
                        {groupName}
                    </h3>
                    <div className="space-y-2 pl-4 border-l-2 border-slate-200">
                        {tasksInGroup.map(renderTaskItem)}
                    </div>
                </div>
            ))}
        </div>
    );

    const renderDateView = () => (
        <div className="space-y-2">
            {sortedTasksByDate.map(renderTaskItem)}
        </div>
    );

    return (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden animate-fade-in">
             <div className="p-4 border-b flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">My Action Items</h2>
                    <p className="text-sm text-slate-500 mt-1">A consolidated view of all your tasks across all engaged opportunities.</p>
                </div>
                <div className="flex items-center space-x-2 p-1 bg-slate-200 rounded-lg">
                    <button 
                        onClick={() => setViewMode('date')}
                        className={`px-3 py-1 rounded-md text-sm font-semibold transition ${viewMode === 'date' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:bg-slate-300'}`}
                    >
                        Sort by Due Date
                    </button>
                    <button 
                        onClick={() => setViewMode('opportunity')}
                        className={`px-3 py-1 rounded-md text-sm font-semibold transition ${viewMode === 'opportunity' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:bg-slate-300'}`}
                    >
                        Group by Opportunity
                    </button>
                </div>
            </div>
            <div className="p-4 md:p-6 bg-slate-50">
                {tasks.length === 0 ? (
                    <div className="text-center py-16 text-slate-500">
                        <div className="text-green-500 text-5xl mb-4 inline-block">{ICONS.checkCircle}</div>
                        <h3 className="text-xl font-semibold text-slate-700">All caught up!</h3>
                        <p>You have no pending action items.</p>
                    </div>
                ) : (
                    viewMode === 'date' ? renderDateView() : renderGroupedView()
                )}
            </div>
        </div>
    );
};

export default TaskCockpit;