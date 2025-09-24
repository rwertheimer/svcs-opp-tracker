const MS_IN_DAY = 1000 * 60 * 60 * 24;

const normalizeToLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const parseDueDate = (value?: string | null): Date | null => {
    if (!value) return null;

    let parsed: Date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        parsed = new Date(year, month - 1, day);
    } else {
        parsed = new Date(value);
    }

    if (Number.isNaN(parsed.getTime())) return null;
    return normalizeToLocalDay(parsed);
};

const today = () => normalizeToLocalDay(new Date());

export type DueDateStatus = 'no-due-date' | 'overdue' | 'due-soon' | 'upcoming' | 'due-later';

export const getDueDateStatus = (dueDate?: string | null): DueDateStatus => {
    const parsed = parseDueDate(dueDate);
    if (!parsed) {
        return 'no-due-date';
    }

    const now = today();
    const diffDays = Math.round((parsed.getTime() - now.getTime()) / MS_IN_DAY);

    if (diffDays < 0) return 'overdue';
    if (diffDays === 0) return 'due-soon';
    if (diffDays <= 3) return 'due-soon';
    if (diffDays <= 7) return 'upcoming';
    return 'due-later';
};

export const getDueDateColorClasses = (dueDate?: string | null): string => {
    switch (getDueDateStatus(dueDate)) {
        case 'overdue':
            return 'bg-rose-100 text-rose-700 border border-rose-200';
        case 'due-soon':
            return 'bg-amber-100 text-amber-800 border border-amber-200';
        case 'upcoming':
            return 'bg-sky-100 text-sky-800 border border-sky-200';
        case 'due-later':
            return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
        default:
            return 'bg-slate-100 text-slate-600 border border-slate-200';
    }
};

const pluralize = (count: number, singular: string, plural: string) =>
    `${count} ${count === 1 ? singular : plural}`;

export const getDueDateDescriptor = (dueDate?: string | null): string => {
    const parsed = parseDueDate(dueDate);
    if (!parsed) {
        return 'No due date';
    }

    const now = today();
    const diff = Math.round((parsed.getTime() - now.getTime()) / MS_IN_DAY);

    if (diff < -1) {
        return `${pluralize(Math.abs(diff), 'day', 'days')} overdue`;
    }
    if (diff === -1) {
        return '1 day overdue';
    }
    if (diff === 0) {
        return 'Due today';
    }
    if (diff === 1) {
        return 'Due tomorrow';
    }

    return '';
};

export const formatDueDate = (dueDate?: string | null): string => {
    const parsed = parseDueDate(dueDate);
    if (!parsed) {
        return 'No due date';
    }
    return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};
