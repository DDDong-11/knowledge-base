import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RecentCopies } from '../components/RecentCopies';

describe('RecentCopies', () => {
  it('is collapsed by default and shows a placeholder when expanded', async () => {
    render(<RecentCopies />);
    const toggle = screen.getByRole('button', { name: /最近复制/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('即将推出')).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('即将推出')).toBeInTheDocument();
  });
});
