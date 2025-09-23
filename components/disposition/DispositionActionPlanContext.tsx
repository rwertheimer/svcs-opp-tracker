import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ActionItem, Disposition, DispositionStatus, Opportunity, User, Document } from '../../types';
import { ActionItemStatus } from '../../types';
import { generateDefaultPlan } from '../../services/actionPlanGenerator';
import { useToast } from '../Toast';
import type { SaveDispositionActionPlanPayload, SaveDispositionActionPlanResponse } from '../../services/apiService';

interface DispositionActionPlanProviderProps {
    opportunity: Opportunity;
    currentUser: User;
    onSaveActionPlan: (payload: SaveDispositionActionPlanPayload) => Promise<SaveDispositionActionPlanResponse>;
    children: React.ReactNode;
}

export type StagedActionItem = {
    name: string;
    status: ActionItemStatus;
    due_date: string;
    documents: Document[];
    assigned_to_user_id: string;
};

const sanitizeActionItem = (item: ActionItem): ActionItem => ({
    ...item,
    due_date: item.due_date ?? '',
    documents: Array.isArray(item.documents) ? item.documents : [],
});

const sanitizeActionItemCollection = (items: ActionItem[] | null | undefined): ActionItem[] => {
    if (!Array.isArray(items)) {
        return [];
    }
    return items.map(sanitizeActionItem);
};

const normalizeDocumentsForCompare = (documents: Document[] | undefined): Document[] => {
    if (!Array.isArray(documents)) return [];
    return documents.map(doc => ({ id: doc.id, text: doc.text, url: doc.url }));
};

const toComparableActionItems = (items: ActionItem[]): Array<{
    action_item_id: string;
    name: string;
    status: ActionItemStatus;
    due_date: string;
    assigned_to_user_id: string;
    documents: Document[];
}> =>
    items
        .map(item => ({
            action_item_id: item.action_item_id,
            name: item.name,
            status: item.status,
            due_date: item.due_date || '',
            assigned_to_user_id: item.assigned_to_user_id,
            documents: normalizeDocumentsForCompare(item.documents),
        }))
        .sort((a, b) => a.action_item_id.localeCompare(b.action_item_id));

const areActionItemCollectionsEqual = (a: ActionItem[], b: ActionItem[]): boolean => {
    if (a.length !== b.length) return false;
    const normA = toComparableActionItems(a);
    const normB = toComparableActionItems(b);
    return normA.every((item, index) => {
        const other = normB[index];
        if (!other) return false;
        if (
            item.name !== other.name ||
            item.status !== other.status ||
            item.due_date !== other.due_date ||
            item.assigned_to_user_id !== other.assigned_to_user_id
        ) {
            return false;
        }
        const docsA = item.documents ?? [];
        const docsB = other.documents ?? [];
        if (docsA.length !== docsB.length) return false;
        return docsA.every((doc, docIndex) => {
            const counterpart = docsB[docIndex];
            return counterpart && doc.id === counterpart.id && doc.text === counterpart.text && doc.url === counterpart.url;
        });
    });
};

interface DispositionActionPlanContextValue {
    opportunity: Opportunity;
    currentUser: User;
    draftDisposition: Disposition;
    updateDisposition: (updates: Partial<Disposition>) => void;
    changeDispositionStatus: (status: DispositionStatus) => boolean;
    resetDraft: () => void;
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
    isStagePersisting: boolean;
    confirmDiscardStaged: () => boolean;
    updateActionItem: (itemId: string, updates: Partial<ActionItem>) => void;
    deleteActionItem: (itemId: string) => void;
    queueSaveOperation: (operation: () => Promise<void> | void) => Promise<void>;
}

const DispositionActionPlanContext = createContext<DispositionActionPlanContextValue | null>(null);

export const DispositionActionPlanProvider: React.FC<DispositionActionPlanProviderProps> = ({
    opportunity,
    currentUser,
    onSaveActionPlan,
    children,
}) => {
    const { showToast } = useToast();
    const [baselineDisposition, setBaselineDisposition] = useState<Disposition>({ ...opportunity.disposition });
    const [draftDisposition, setDraftDisposition] = useState<Disposition>({ ...opportunity.disposition });
    const [baselineActionItems, setBaselineActionItems] = useState<ActionItem[]>(
        sanitizeActionItemCollection(opportunity.actionItems)
    );
    const [draftActionItems, setDraftActionItems] = useState<ActionItem[]>(
        sanitizeActionItemCollection(opportunity.actionItems)
    );
    const [stagedActionItems, setStagedActionItems] = useState<StagedActionItem[]>([]);
    const [isStagePersisting, setIsStagePersisting] = useState(false);
    const [isCommittingDraft, setIsCommittingDraft] = useState(false);
    const saveQueue = useRef<Promise<void>>(Promise.resolve());

    useEffect(() => {
        setBaselineDisposition({ ...opportunity.disposition });
        setDraftDisposition({ ...opportunity.disposition });
        const sanitized = sanitizeActionItemCollection(opportunity.actionItems);
        setBaselineActionItems(sanitized);
        setDraftActionItems(sanitized);
        setStagedActionItems([]);
    }, [opportunity.actionItems, opportunity.disposition.version, opportunity.opportunities_id]);

    const actionItems = useMemo(() => sanitizeActionItemCollection(draftActionItems), [draftActionItems]);

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
    }), []);

    const hasUnsavedDispositionChanges = useMemo(() => {
        const normalizedDraft = normalizeDispositionForCompare(draftDisposition);
        const normalizedBaseline = normalizeDispositionForCompare(baselineDisposition);
        return (
            normalizedDraft.status !== normalizedBaseline.status ||
            normalizedDraft.notes !== normalizedBaseline.notes ||
            normalizedDraft.reason !== normalizedBaseline.reason ||
            normalizedDraft.services_amount_override !== normalizedBaseline.services_amount_override ||
            normalizedDraft.forecast_category_override !== normalizedBaseline.forecast_category_override
        );
    }, [baselineDisposition, draftDisposition, normalizeDispositionForCompare]);

    const hasDraftActionItemChanges = useMemo(
        () => !areActionItemCollectionsEqual(draftActionItems, baselineActionItems),
        [baselineActionItems, draftActionItems]
    );

    const hasStagedActionPlanChanges = hasDraftActionItemChanges || stagedActionItems.length > 0;

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
        if (!hasStagedActionPlanChanges) return true;
        const hasNewTasks = stagedActionItems.length > 0;
        const confirmed = window.confirm(
            hasNewTasks
                ? 'You have staged action plan tasks that are not saved. Save Action Plan to keep them, or choose OK to discard.'
                : 'You have unsaved changes to action plan tasks. Save Action Plan to keep them, or choose OK to discard.'
        );
        if (confirmed) {
            setStagedActionItems([]);
            setDraftActionItems(sanitizeActionItemCollection(baselineActionItems));
        }
        return confirmed;
    }, [baselineActionItems, hasStagedActionPlanChanges, stagedActionItems.length]);

    const changeDispositionStatus = useCallback(
        (status: DispositionStatus) => {
            if (status !== 'Services Fit' && hasStagedActionPlanChanges) {
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
        [confirmDiscardStaged, hasStagedActionPlanChanges, opportunity.opportunities_has_services_flag]
    );

    const updateDisposition = useCallback((updates: Partial<Disposition>) => {
        setDraftDisposition(prev => ({ ...prev, ...updates }));
    }, []);

    const resetDraft = useCallback(() => {
        setDraftDisposition({ ...baselineDisposition });
        setDraftActionItems(sanitizeActionItemCollection(baselineActionItems));
        setStagedActionItems([]);
    }, [baselineActionItems, baselineDisposition]);

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

    const commitDraft = useCallback(async () => {
        const shouldSaveDisposition = hasUnsavedDispositionChanges;
        const shouldSaveActionPlan = hasStagedActionPlanChanges;
        if (!shouldSaveDisposition && !shouldSaveActionPlan) return;

        setIsCommittingDraft(true);
        if (shouldSaveActionPlan) {
            setIsStagePersisting(true);
        }

        try {
            await queueSaveOperation(async () => {
                const mergedActionItems: SaveDispositionActionPlanPayload['actionItems'] = [
                    ...sanitizeActionItemCollection(draftActionItems).map(item => ({
                        action_item_id: item.action_item_id,
                        name: item.name,
                        status: item.status,
                        due_date: item.due_date ? item.due_date : null,
                        documents: Array.isArray(item.documents) ? item.documents : [],
                        assigned_to_user_id: item.assigned_to_user_id,
                        created_by_user_id: item.created_by_user_id,
                    })),
                    ...stagedActionItems.map(item => ({
                        name: item.name,
                        status: item.status,
                        due_date: item.due_date ? item.due_date : null,
                        documents: Array.isArray(item.documents) ? item.documents : [],
                        assigned_to_user_id: item.assigned_to_user_id || currentUser.user_id,
                        created_by_user_id: currentUser.user_id,
                    })),
                ];

                const dispositionPayload: SaveDispositionActionPlanPayload['disposition'] = {
                    status: draftDisposition.status,
                    reason: draftDisposition.reason ?? '',
                    services_amount_override:
                        draftDisposition.services_amount_override === undefined
                            ? null
                            : draftDisposition.services_amount_override,
                    forecast_category_override:
                        draftDisposition.forecast_category_override === undefined
                            ? null
                            : draftDisposition.forecast_category_override,
                    version: draftDisposition.version,
                    notesSnapshot: draftDisposition.notes ?? '',
                };

                const result = await onSaveActionPlan({ disposition: dispositionPayload, actionItems: mergedActionItems });
                const savedDisposition = result?.disposition ?? draftDisposition;
                const savedActionItems = sanitizeActionItemCollection(result?.actionItems ?? draftActionItems);

                setBaselineDisposition({ ...savedDisposition });
                setDraftDisposition({ ...savedDisposition });
                setBaselineActionItems(savedActionItems);
                setDraftActionItems(savedActionItems);
                setStagedActionItems([]);
                showToast('Action plan saved', 'success');
            });
        } catch (error: any) {
            if (error?.status === 409) {
                showToast('Save conflict: another user updated this opportunity. Refresh to continue.', 'error');
            } else {
                showToast('Failed to save changes', 'error');
            }
            throw error;
        } finally {
            if (shouldSaveActionPlan) {
                setIsStagePersisting(false);
            }
            setIsCommittingDraft(false);
        }
    }, [
        currentUser.user_id,
        draftActionItems,
        draftDisposition,
        hasStagedActionPlanChanges,
        hasUnsavedDispositionChanges,
        onSaveActionPlan,
        queueSaveOperation,
        showToast,
        stagedActionItems,
    ]);

    const addStagedActionItem = useCallback(
        (item: Partial<StagedActionItem>) => {
            setStagedActionItems(prev => [
                ...prev,
                {
                    name: item.name ?? '',
                    status: item.status ?? ActionItemStatus.NotStarted,
                    due_date: item.due_date ?? '',
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

    const updateActionItem = useCallback((itemId: string, updates: Partial<ActionItem>) => {
        setDraftActionItems(prev =>
            prev.map(item =>
                item.action_item_id === itemId
                    ? sanitizeActionItem({
                          ...item,
                          ...updates,
                          documents: Array.isArray(updates.documents) ? updates.documents : item.documents,
                          due_date: updates.due_date ?? item.due_date,
                      })
                    : item
            )
        );
    }, []);

    const deleteActionItem = useCallback((itemId: string) => {
        setDraftActionItems(prev => prev.filter(item => item.action_item_id !== itemId));
    }, []);

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
            isStagePersisting,
            confirmDiscardStaged,
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
            currentUser,
            deleteActionItem,
            draftDisposition,
            hasStagedActionPlanChanges,
            hasUnsavedDispositionChanges,
            isCommittingDraft,
            isDirty,
            queueSaveOperation,
            removeStagedActionItem,
            resetDraft,
            commitDraft,
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

