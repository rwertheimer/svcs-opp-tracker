import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { getDueDateDescriptor } from '../../../components/disposition/dateUtils';

describe('getDueDateDescriptor', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns "Due today" when the due date matches today in local time', () => {
        vi.setSystemTime(new Date('2024-03-05T12:00:00Z'));

        expect(getDueDateDescriptor('2024-03-05')).toBe('Due today');
    });

    it('omits the descriptor for upcoming due dates within the next week', () => {
        vi.setSystemTime(new Date('2024-03-01T09:00:00Z'));

        expect(getDueDateDescriptor('2024-03-05')).toBe('');
    });

    it('omits the descriptor for future due dates beyond a week', () => {
        vi.setSystemTime(new Date('2024-03-01T09:00:00Z'));

        expect(getDueDateDescriptor('2024-03-20')).toBe('');
    });
});
