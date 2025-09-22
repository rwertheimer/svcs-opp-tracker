import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ActionItem, Disposition, DispositionStatus, Opportunity, User, Document } from '../../types';
import { ActionItemStatus } from '../../types';
import { generateDefaultPlan } from '../../services/actionPlanGenerator';
import { useToast } from '../Toast';

const cloneDocuments = (documents?: Document[] | null): Document[] =>
    Array.isArray(documents) ? documents.map(document => ({ ...document })) : [];

const cloneDisposition = (source: Disposition): Disposition => ({
    ...source,
    notes: source.notes ?? '',
    reason: source.reason ?? '',
    documents: cloneDocuments(source.documents),
});

const mergeDispositionWithTaskDocuments = (opportunity: Opportunity, source: Disposition): Disposition => {
    const base = cloneDisposition(source);
    const taskDocuments = (opportunity.actionItems || []).flatMap(item => cloneDocuments(item.documents));
    if (taskDocuments.length === 0) {
        return base;
    }

    const existingIds = new Set(base.documents.map(doc => doc.id));
    const mergedDocuments = [...base.documents];

    taskDocuments.forEach(doc => {
        if (!doc.id || !existingIds.has(doc.id)) {
            mergedDocuments.push(doc);
            if (doc.id) existingIds.add(doc.id);
        }
    });

    return {
        ...base,
        documents: mergedDocuments,
    };
};

interface DispositionActionPlanProviderProps {
    opportunity: Opportunity;
    currentUser: User;
    onSaveDisposition: (disposition: Disposition) => Promise<Disposition | void> | Disposition | void;
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
    assigned_to_user_id: string;
};

interface DispositionActionPlanContextValue {
    opportunity: Opportunity;
    currentUser: User;
    draftDisposition: Disposition;
    updateDisposition: (updates: Partial<Disposition>) => void;
    changeDispositionStatus: (status: DispositionStatus) => boolean;
    resetDraft: () => void;
    saveDisposition: () => Promise<void> | void;
    commitDraft: () => Promise<void>;
    confirmDiscardChanges: () => boolean;
    isDispositioned: boolean;
    isDirty: boolean;
    hasUnsavedDispositionChanges: boolean;
    hasStagedActionPlanChanges: boolean;
    isCommittingDraft: boolean;
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
    const [baselineDisposition, setBaselineDisposition] = useState<Disposition>(() =>
        mergeDispositionWithTaskDocuments(opportunity, opportunity.disposition)
    );
    const [draftDisposition, setDraftDisposition] = useState<Disposition>(() =>
        mergeDispositionWithTaskDocuments(opportunity, opportunity.disposition)
    );
    const [stagedActionItems, setStagedActionItems] = useState<StagedActionItem[]>([]);
    const [isStagePersisting, setIsStagePersisting] = useState(false);
    const [isCommittingDraft, setIsCommittingDraft] = useState(false);
    const saveQueue = useRef<Promise<void>>(Promise.resolve());

    useEffect(() => {
        const hydrated = mergeDispositionWithTaskDocuments(opportunity, opportunity.disposition);
        setBaselineDisposition(hydrated);
        setDraftDisposition(hydrated);
        setStagedActionItems([]);
    }, [opportunity.opportunities_id, opportunity.disposition.version]);

    const actionItems = useMemo(() => {
        return (opportunity.actionItems || []).map(item => ({ ...item, documents: item.documents || [] }));
    }, [opportunity.actionItems]);

    useEffect(() => {
        if (draftDisposition.status !== 'Services Fit') {
            return;
        }

        if (actionItems.length > 0) {
            return;
        }

        const generatedPlan = generateDefaultPlan(opportunity, new Date());

        if (stagedActionItems.length === 0) {
            setStagedActionItems(
                generatedPlan.map(item => ({
                    ...item,
                    assigned_to_user_id: currentUser.user_id,
                }))
            );
            return;
        }

        if (!stagedActionItems.some(item => !item.due_date)) {
            return;
        }

        setStagedActionItems(prev => {
            let updated = false;
            const merged = prev.map(item => {
                if (item.due_date) {
                    return item;
                }

                const template = generatedPlan.find(planItem => planItem.name === item.name);
                if (template?.due_date) {
                    updated = true;
                    return { ...item, due_date: template.due_date };
                }

                return item;
            });

            return updated ? merged : prev;
        });
    }, [actionItems.length, currentUser.user_id, draftDisposition.status, opportunity]);

    const normalizeDispositionForCompare = useCallback((disposition: Disposition) => ({
        status: disposition.status,
        notes: disposition.notes ?? '',
        reason: disposition.reason ?? '',
        services_amount_override: disposition.services_amount_override ?? null,
        forecast_category_override: disposition.forecast_category_override ?? '',
        documents: cloneDocuments(disposition.documents).map(doc => ({
            id: doc.id ?? '',
            text: doc.text ?? '',
            url: doc.url ?? '',
        })),
    }), []);

    const hasUnsavedDispositionChanges = useMemo(() => {
        const normalizedDraft = normalizeDispositionForCompare(draftDisposition);
        const normalizedBaseline = normalizeDispositionForCompare(baselineDisposition);
        const documentsChanged =
            normalizedDraft.documents.length !== normalizedBaseline.documents.length ||
            normalizedDraft.documents.some((doc, index) => {
                const baselineDoc = normalizedBaseline.documents[index];
                return (
                    !baselineDoc || doc.id !== baselineDoc.id || doc.text !== baselineDoc.text || doc.url !== baselineDoc.url
                );
            });
        return (
            normalizedDraft.status !== normalizedBaseline.status ||
            normalizedDraft.notes !== normalizedBaseline.notes ||
            normalizedDraft.reason !== normalizedBaseline.reason ||
            normalizedDraft.services_amount_override !== normalizedBaseline.services_amount_override ||
            normalizedDraft.forecast_category_override !== normalizedBaseline.forecast_category_override ||
            documentsChanged
        );
    }, [baselineDisposition, draftDisposition, normalizeDispositionForCompare]);

    const hasStagedActionPlanChanges = stagedActionItems.length > 0;

    const isDirty = hasUnsavedDispositionChanges || hasStagedActionPlanChanges;

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

            if (status !== 'Services Fit') {
                setStagedActionItems([]);
            }

            return true;
        },
        [confirmDiscardStaged, opportunity.opportunities_has_services_flag, stagedActionItems.length]
    );

    const updateDisposition = useCallback((updates: Partial<Disposition>) => {
        setDraftDisposition(prev => ({
            ...prev,
            ...updates,
            documents: updates.documents ? cloneDocuments(updates.documents) : prev.documents,
        }));
    }, []);

    const resetDraft = useCallback(() => {
        setDraftDisposition(cloneDisposition(baselineDisposition));
        setStagedActionItems([]);
    }, [baselineDisposition]);

    const confirmDiscardChanges = useCallback(() => {
        if (!isDirty) return true;

        const parts: string[] = [];
        if (hasUnsavedDispositionChanges) parts.push('disposition changes');
        if (hasStagedActionPlanChanges) parts.push('action plan tasks');
        const message = `You have unsaved ${parts.join(' and ')}. Save your work or choose OK to discard them.`;
        const confirmed = window.confirm(message);
        if (confirmed) {
            resetDraft();
        }
        return confirmed;
    }, [hasStagedActionPlanChanges, hasUnsavedDispositionChanges, isDirty, resetDraft]);

    const saveDisposition = useCallback(() => {
        const payload = cloneDisposition(draftDisposition);
        return queueSaveOperation(() => Promise.resolve(onSaveDisposition(payload)));
    }, [draftDisposition, onSaveDisposition, queueSaveOperation]);

    const persistStagedItems = useCallback(async () => {
        for (const item of stagedActionItems) {
            await onActionItemCreate(opportunity.opportunities_id, {
                opportunity_id: opportunity.opportunities_id,
                name: item.name,
                status: item.status,
                due_date: item.due_date,
                notes: item.notes,
                documents: item.documents ?? [],
                assigned_to_user_id: item.assigned_to_user_id || currentUser.user_id,
            });
        }
        setStagedActionItems([]);
        showToast('Action plan saved', 'success');
    }, [
        currentUser.user_id,
        onActionItemCreate,
        opportunity.opportunities_id,
        showToast,
        stagedActionItems,
    ]);

    const commitDraft = useCallback(async () => {
        const shouldSaveDisposition = hasUnsavedDispositionChanges;
        const shouldPersistStaged = stagedActionItems.length > 0;
        if (!shouldSaveDisposition && !shouldPersistStaged) return;

        setIsCommittingDraft(true);
        if (shouldPersistStaged) {
            setIsStagePersisting(true);
        }

        try {
            await queueSaveOperation(async () => {
                if (shouldSaveDisposition) {
                    const payload = cloneDisposition(draftDisposition);
                    const result = await onSaveDisposition(payload);
                    const savedDisposition = cloneDisposition((result ?? payload) as Disposition);
                    const hydratedSaved = mergeDispositionWithTaskDocuments(opportunity, savedDisposition);
                    setBaselineDisposition(hydratedSaved);
                    setDraftDisposition(hydratedSaved);
                }

                if (shouldPersistStaged) {
                    await persistStagedItems();
                }
            });
        } catch (error: any) {
            if (error?.status === 409) {
                showToast('Save conflict: another user updated this opportunity. Refresh to continue.', 'error');
            } else {
                showToast('Failed to save changes', 'error');
            }
            throw error;
        } finally {
            if (shouldPersistStaged) {
                setIsStagePersisting(false);
            }
            setIsCommittingDraft(false);
        }
    }, [
        draftDisposition,
        hasUnsavedDispositionChanges,
        onSaveDisposition,
        opportunity,
        persistStagedItems,
        queueSaveOperation,
        stagedActionItems.length,
        showToast,
    ]);

    const addStagedActionItem = useCallback(
        (item: Partial<StagedActionItem>) => {
            setStagedActionItems(prev => [
                ...prev,
                {
                    name: item.name ?? '',
                    status: item.status ?? ActionItemStatus.NotStarted,
                    due_date: item.due_date ?? '',
                    notes: item.notes ?? '',
                    documents: item.documents ?? [],
                    assigned_to_user_id: item.assigned_to_user_id ?? currentUser.user_id,
                },
            ]);
        },
        [currentUser.user_id]
    );

    const updateStagedActionItem = useCallback((index: number, updates: Partial<StagedActionItem>) => {
        setStagedActionItems(prev =>
            prev.map((item, idx) =>
                idx === index
                    ? {
                          ...item,
                          ...updates,
                          documents: updates.documents ?? item.documents,
                          assigned_to_user_id: updates.assigned_to_user_id ?? item.assigned_to_user_id,
                      }
                    : item
            )
        );
    }, []);

    const removeStagedActionItem = useCallback((index: number) => {
        setStagedActionItems(prev => prev.filter((_, idx) => idx !== index));
    }, []);

    const persistStagedActionItems = useCallback(async () => {
        if (stagedActionItems.length === 0 || isStagePersisting) return;
        setIsStagePersisting(true);
        try {
            await queueSaveOperation(persistStagedItems);
        } catch (error) {
            console.error('Failed to save staged action plan', error);
            showToast('Failed to save action plan', 'error');
            throw error;
        } finally {
            setIsStagePersisting(false);
        }
    }, [isStagePersisting, persistStagedItems, queueSaveOperation, showToast]);

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
            commitDraft,
            confirmDiscardChanges,
            saveDisposition,
            isDispositioned: draftDisposition.status === 'Services Fit',
            isDirty,
            hasUnsavedDispositionChanges,
            hasStagedActionPlanChanges,
            isCommittingDraft,
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
            confirmDiscardChanges,
            createActionItem,
            currentUser,
            deleteActionItem,
            draftDisposition,
            hasStagedActionPlanChanges,
            hasUnsavedDispositionChanges,
            isCommittingDraft,
            isDirty,
            persistStagedActionItems,
            queueSaveOperation,
            removeStagedActionItem,
            resetDraft,
            commitDraft,
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

