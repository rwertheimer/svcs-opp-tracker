import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ActionItem, Disposition, DispositionStatus, Opportunity, User, Document } from '../../types';
import { ActionItemStatus } from '../../types';
import { useToast } from '../Toast';

interface DispositionActionPlanProviderProps {
    opportunity: Opportunity;
    currentUser: User;
    onSaveDisposition: (disposition: Disposition) => Promise<void> | void;
    onActionItemCreate: (
        opportunityId: string,
        item: Omit<ActionItem, 'action_item_id' | 'created_by_user_id'>
    ) => Promise<void> | void;
    onActionItemUpdate: (opportunityId: string, itemId: string, updates: Partial<ActionItem>) => Promise<void> | void;
    onActionItemDelete: (opportunityId: string, itemId: string) => Promise<void> | void;
    children: React.ReactNode;
}

export type StagedActionItem = {
    name: string;
    status: ActionItemStatus;
    due_date: string;
    notes: string;
    documents: Document[];
};

interface DispositionActionPlanContextValue {
    opportunity: Opportunity;
    currentUser: User;
    draftDisposition: Disposition;
    updateDisposition: (updates: Partial<Disposition>) => void;
    changeDispositionStatus: (status: DispositionStatus) => boolean;
    resetDraft: () => void;
    saveDisposition: () => Promise<void> | void;
    isDispositioned: boolean;
    actionItems: ActionItem[];
    stagedActionItems: StagedActionItem[];
    addStagedActionItem: (item: Partial<StagedActionItem>) => void;
    updateStagedActionItem: (index: number, updates: Partial<StagedActionItem>) => void;
    removeStagedActionItem: (index: number) => void;
    persistStagedActionItems: () => Promise<void>;
    isStagePersisting: boolean;
    confirmDiscardStaged: () => boolean;
    createActionItem: (
        item: Omit<ActionItem, 'action_item_id' | 'created_by_user_id'>
    ) => Promise<void> | void;
    updateActionItem: (itemId: string, updates: Partial<ActionItem>) => Promise<void> | void;
    deleteActionItem: (itemId: string) => Promise<void> | void;
    queueSaveOperation: (operation: () => Promise<void> | void) => Promise<void>;
}

const DispositionActionPlanContext = createContext<DispositionActionPlanContextValue | null>(null);

const DEFAULT_ACTION_TASKS: StagedActionItem[] = [
    { name: 'Contact Opp Owner', status: ActionItemStatus.NotStarted, due_date: '', notes: '', documents: [] },
    { name: 'Scope and develop proposal', status: ActionItemStatus.NotStarted, due_date: '', notes: '', documents: [] },
    { name: 'Share proposal', status: ActionItemStatus.NotStarted, due_date: '', notes: '', documents: [] },
    { name: 'Finalize proposal', status: ActionItemStatus.NotStarted, due_date: '', notes: '', documents: [] },
    { name: 'Ironclad approval', status: ActionItemStatus.NotStarted, due_date: '', notes: '', documents: [] },
];

export const DispositionActionPlanProvider: React.FC<DispositionActionPlanProviderProps> = ({
    opportunity,
    currentUser,
    onSaveDisposition,
    onActionItemCreate,
    onActionItemUpdate,
    onActionItemDelete,
    children,
}) => {
    const { showToast } = useToast();
    const [draftDisposition, setDraftDisposition] = useState<Disposition>({ ...opportunity.disposition });
    const [stagedActionItems, setStagedActionItems] = useState<StagedActionItem[]>([]);
    const [isStagePersisting, setIsStagePersisting] = useState(false);
    const saveQueue = useRef<Promise<void>>(Promise.resolve());

    useEffect(() => {
        setDraftDisposition({ ...opportunity.disposition });
        setStagedActionItems([]);
    }, [opportunity.opportunities_id, opportunity.disposition]);

    const actionItems = useMemo(() => {
        return (opportunity.actionItems || []).map(item => ({ ...item, documents: item.documents || [] }));
    }, [opportunity.actionItems]);

    const queueSaveOperation = useCallback((operation: () => Promise<void> | void) => {
        saveQueue.current = saveQueue.current
            .then(() => Promise.resolve(operation()))
            .catch(error => {
                saveQueue.current = Promise.resolve();
                throw error;
            });
        return saveQueue.current;
    }, []);

    const confirmDiscardStaged = useCallback(() => {
        if (stagedActionItems.length === 0) return true;
        const confirmed = window.confirm(
            'You have staged action plan tasks that are not saved. Save Action Plan to keep them, or choose OK to discard.'
        );
        if (confirmed) {
            setStagedActionItems([]);
        }
        return confirmed;
    }, [stagedActionItems.length]);

    const changeDispositionStatus = useCallback(
        (status: DispositionStatus) => {
            if (status !== 'Services Fit' && stagedActionItems.length > 0) {
                const confirmed = confirmDiscardStaged();
                if (!confirmed) {
                    return false;
                }
            }

            setDraftDisposition(prev => {
                const next: Disposition = { ...prev, status };
                if (status === 'Services Fit') {
                    next.reason = '';
                } else if (
                    status !== 'No Action Needed' || (status === 'No Action Needed' && opportunity.opportunities_has_services_flag === 'Yes')
                ) {
                    next.reason = '';
                }
                return next;
            });

            if (status === 'Services Fit') {
                const hasPersisted = actionItems.length > 0;
                if (!hasPersisted && stagedActionItems.length === 0) {
                    setStagedActionItems(DEFAULT_ACTION_TASKS.map(item => ({ ...item })));
                }
            } else {
                setStagedActionItems([]);
            }

            return true;
        },
        [actionItems.length, confirmDiscardStaged, opportunity.opportunities_has_services_flag, stagedActionItems.length]
    );

    const updateDisposition = useCallback((updates: Partial<Disposition>) => {
        setDraftDisposition(prev => ({ ...prev, ...updates }));
    }, []);

    const resetDraft = useCallback(() => {
        setDraftDisposition({ ...opportunity.disposition });
        setStagedActionItems([]);
    }, [opportunity.disposition]);

    const saveDisposition = useCallback(() => {
        const payload = { ...draftDisposition };
        return queueSaveOperation(() => Promise.resolve(onSaveDisposition(payload)));
    }, [draftDisposition, onSaveDisposition, queueSaveOperation]);

    const addStagedActionItem = useCallback((item: Partial<StagedActionItem>) => {
        setStagedActionItems(prev => [
            ...prev,
            {
                name: item.name ?? '',
                status: item.status ?? ActionItemStatus.NotStarted,
                due_date: item.due_date ?? '',
                notes: item.notes ?? '',
                documents: item.documents ?? [],
            },
        ]);
    }, []);

    const updateStagedActionItem = useCallback((index: number, updates: Partial<StagedActionItem>) => {
        setStagedActionItems(prev =>
            prev.map((item, idx) => (idx === index ? { ...item, ...updates, documents: updates.documents ?? item.documents } : item))
        );
    }, []);

    const removeStagedActionItem = useCallback((index: number) => {
        setStagedActionItems(prev => prev.filter((_, idx) => idx !== index));
    }, []);

    const persistStagedActionItems = useCallback(async () => {
        if (stagedActionItems.length === 0 || isStagePersisting) return;
        setIsStagePersisting(true);
        try {
            await queueSaveOperation(async () => {
                for (const item of stagedActionItems) {
                    await onActionItemCreate(opportunity.opportunities_id, {
                        opportunity_id: opportunity.opportunities_id,
                        name: item.name,
                        status: item.status,
                        due_date: item.due_date,
                        notes: item.notes,
                        documents: item.documents ?? [],
                        assigned_to_user_id: currentUser.user_id,
                    });
                }
            });
            setStagedActionItems([]);
            showToast('Action plan saved', 'success');
        } catch (error) {
            console.error('Failed to save staged action plan', error);
            showToast('Failed to save action plan', 'error');
            throw error;
        } finally {
            setIsStagePersisting(false);
        }
    }, [
        currentUser.user_id,
        onActionItemCreate,
        opportunity.opportunities_id,
        queueSaveOperation,
        showToast,
        stagedActionItems,
        isStagePersisting,
    ]);

    const createActionItem = useCallback(
        (item: Omit<ActionItem, 'action_item_id' | 'created_by_user_id'>) =>
            onActionItemCreate(opportunity.opportunities_id, item),
        [onActionItemCreate, opportunity.opportunities_id]
    );

    const updateActionItem = useCallback(
        (itemId: string, updates: Partial<ActionItem>) =>
            onActionItemUpdate(opportunity.opportunities_id, itemId, updates),
        [onActionItemUpdate, opportunity.opportunities_id]
    );

    const deleteActionItem = useCallback(
        (itemId: string) => onActionItemDelete(opportunity.opportunities_id, itemId),
        [onActionItemDelete, opportunity.opportunities_id]
    );

    const value: DispositionActionPlanContextValue = useMemo(
        () => ({
            opportunity,
            currentUser,
            draftDisposition,
            updateDisposition,
            changeDispositionStatus,
            resetDraft,
            saveDisposition,
            isDispositioned: draftDisposition.status === 'Services Fit',
            actionItems,
            stagedActionItems,
            addStagedActionItem,
            updateStagedActionItem,
            removeStagedActionItem,
            persistStagedActionItems,
            isStagePersisting,
            confirmDiscardStaged,
            createActionItem,
            updateActionItem,
            deleteActionItem,
            queueSaveOperation,
        }),
        [
            actionItems,
            addStagedActionItem,
            changeDispositionStatus,
            confirmDiscardStaged,
            createActionItem,
            currentUser,
            deleteActionItem,
            draftDisposition,
            persistStagedActionItems,
            queueSaveOperation,
            removeStagedActionItem,
            resetDraft,
            saveDisposition,
            stagedActionItems,
            updateActionItem,
            updateDisposition,
            updateStagedActionItem,
            isStagePersisting,
            opportunity,
        ]
    );

    return <DispositionActionPlanContext.Provider value={value}>{children}</DispositionActionPlanContext.Provider>;
};

export const useDispositionActionPlan = () => {
    const context = useContext(DispositionActionPlanContext);
    if (!context) {
        throw new Error('useDispositionActionPlan must be used within a DispositionActionPlanProvider');
    }
    return context;
};

