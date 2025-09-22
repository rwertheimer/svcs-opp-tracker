import { ActionItemStatus, type Document, type Opportunity } from '../types';

export interface GeneratedActionPlanItem {
    name: string;
    status: ActionItemStatus;
    due_date: string;
    notes: string;
    documents: Document[];
}

interface DefaultPlanTemplate extends Omit<GeneratedActionPlanItem, 'due_date'> {
    offsetDays: number;
}

const DEFAULT_PLAN_TEMPLATES: DefaultPlanTemplate[] = [
    {
        name: 'Contact Opp Owner',
        status: ActionItemStatus.NotStarted,
        notes: '',
        documents: [],
        offsetDays: 0,
    },
    {
        name: 'Scope and develop proposal',
        status: ActionItemStatus.NotStarted,
        notes: '',
        documents: [],
        offsetDays: 7,
    },
    {
        name: 'Share proposal',
        status: ActionItemStatus.NotStarted,
        notes: '',
        documents: [],
        offsetDays: 14,
    },
    {
        name: 'Finalize proposal',
        status: ActionItemStatus.NotStarted,
        notes: '',
        documents: [],
        offsetDays: 21,
    },
    {
        name: 'Ironclad approval',
        status: ActionItemStatus.NotStarted,
        notes: '',
        documents: [],
        offsetDays: 28,
    },
];

type StartDateInput = string | Date | null | undefined;

const cloneDocuments = (documents: Document[]) => documents.map(document => ({ ...document }));

const parseStartDate = (startDate: StartDateInput): Date | null => {
    if (!startDate) return null;

    if (startDate instanceof Date) {
        if (Number.isNaN(startDate.getTime())) {
            return null;
        }
        return new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    }

    if (typeof startDate === 'string') {
        const trimmed = startDate.trim();
        if (trimmed.length === 0) {
            return null;
        }

        const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!isoMatch) {
            return null;
        }

        const [_, yearStr, monthStr, dayStr] = isoMatch;
        const year = Number(yearStr);
        const monthIndex = Number(monthStr) - 1;
        const day = Number(dayStr);
        const parsed = new Date(Date.UTC(year, monthIndex, day));
        if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== monthIndex || parsed.getUTCDate() !== day) {
            return null;
        }
        return parsed;
    }

    return null;
};

const addDays = (date: Date, offset: number) => {
    const result = new Date(date.getTime());
    result.setUTCDate(result.getUTCDate() + offset);
    return result;
};

const formatAsIsoDate = (date: Date) => {
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const generateDefaultPlan = (
    opportunity: Opportunity,
    startDate: StartDateInput
): GeneratedActionPlanItem[] => {
    const baselineDate = parseStartDate(startDate);
    const actionItems = opportunity.actionItems || [];

    return DEFAULT_PLAN_TEMPLATES.map(template => {
        const existing = actionItems.find(item => item.name === template.name && item.due_date);
        const due_date = existing?.due_date
            ? existing.due_date
            : baselineDate
            ? formatAsIsoDate(addDays(baselineDate, template.offsetDays))
            : '';

        return {
            name: template.name,
            status: template.status,
            notes: template.notes,
            documents: cloneDocuments(template.documents),
            due_date,
        };
    });
};
