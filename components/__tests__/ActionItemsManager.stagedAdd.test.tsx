import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ActionItemsManager from '../../components/ActionItemsManager';
import type { ActionItem, User } from '../../types';
import { ActionItemStatus } from '../../types';

const users: User[] = [{ user_id: 'u1', name: 'Alice', email: 'a@x.com' }];

describe('ActionItemsManager - staged add', () => {
  it('adds to staged list (pre-save) instead of persisting', () => {
    const onCreate = vi.fn();
    const onStageAdd = vi.fn();

    render(
      <ActionItemsManager
        opportunityId="opp1"
        actionItems={[] as ActionItem[]}
        users={users}
        currentUser={users[0]}
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        isDispositioned={true}
        stagedDefaults={[
          { name: 'Contact Opp Owner', status: ActionItemStatus.NotStarted, due_date: '', notes: '' },
        ]}
        onStageChange={vi.fn()}
        onStageRemove={vi.fn()}
        onStageAdd={onStageAdd}
      />
    );

    const input = screen.getByPlaceholderText('Add a new task...');
    fireEvent.change(input, { target: { value: 'Follow-up email' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(onStageAdd).toHaveBeenCalledWith({ name: 'Follow-up email', status: ActionItemStatus.NotStarted, due_date: '', notes: '' });
  });
});

