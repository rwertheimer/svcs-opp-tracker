import React from 'react';
import { render, screen } from '@testing-library/react';
import AdvancedFilterBuilder from '../../components/AdvancedFilterBuilder';
import type { FilterGroup } from '../../types';

const orgFilters: FilterGroup = {
  id: 'root',
  combinator: 'AND',
  rules: [
    {
      id: 'org-123',
      combinator: 'OR',
      rules: [
        { id: 'r1', field: 'opportunities_owner_name', operator: 'equals', value: 'Alice' },
        { id: 'r2', field: 'opportunities_manager_of_opp_email', operator: 'equals', value: 'mgr@example.com' },
      ],
    } as any,
  ],
};

describe('AdvancedFilterBuilder org chart badge', () => {
  it('shows the Org Chart badge for org-* group ids', () => {
    render(
      <AdvancedFilterBuilder
        isOpen
        onClose={() => {}}
        onApply={() => {}}
        initialFilters={orgFilters}
      />
    );
    expect(screen.getAllByText(/Org Chart/i).length).toBeGreaterThan(0);
  });
});

