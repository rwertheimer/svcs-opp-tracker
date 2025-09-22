import React from 'react';
import { ICONS } from '../../constants';
import { useDispositionActionPlan } from './DispositionActionPlanContext';

const SaveBar: React.FC = () => {
    const {
        isDirty,
        hasUnsavedDispositionChanges,
        hasStagedActionPlanChanges,
        commitDraft,
        resetDraft,
        isCommittingDraft,
    } = useDispositionActionPlan();

    if (!isDirty) return null;

    const parts: string[] = [];
    if (hasUnsavedDispositionChanges) parts.push('disposition');
    if (hasStagedActionPlanChanges) parts.push('action plan');
    const summary = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(' & ')} and ${parts[parts.length - 1]}`;

    const handleSave = async () => {
        try {
            await commitDraft();
        } catch {
            // Error handling is surfaced via context toasts.
        }
    };

    return (
        <div className="sticky top-[70px] z-30 mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 shadow-sm">
            <div className="flex items-center space-x-3 text-sm text-indigo-900">
                <span className="text-indigo-500">{ICONS.informationCircle}</span>
                <span className="font-semibold">Unsaved {summary} changes</span>
            </div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={resetDraft}
                    className="rounded-md border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
                >
                    Discard changes
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={isCommittingDraft}
                    className={`rounded-md px-4 py-2 text-sm font-semibold text-white transition ${
                        isCommittingDraft ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                >
                    {isCommittingDraft ? 'Saving…' : 'Save changes'}
                </button>
            </div>
        </div>
    );
};

export default SaveBar;
