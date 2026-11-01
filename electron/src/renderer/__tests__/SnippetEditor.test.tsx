import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SnippetEditor } from '../components/SnippetEditor';
import { installKb, snip } from './mockKb';

const handlers = () => ({ onSaved: vi.fn(), onDeleted: vi.fn(), onCancel: vi.fn() });

describe('SnippetEditor', () => {
  it('creates with parsed tags and chosen kind', async () => {
    const { kb } = installKb();
    const h = handlers();
    render(<SnippetEditor {...h} />);
    expect(screen.getByLabelText('类型')).toHaveValue('NOTE');
    await userEvent.type(screen.getByLabelText('标题'), 'Docker 清理');
    await userEvent.type(screen.getByLabelText('正文'), 'docker system prune');
    await userEvent.type(screen.getByLabelText('标签'), 'a, b，c');
    await userEvent.selectOptions(screen.getByLabelText('类型'), 'CODE');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(kb.createSnippet).toHaveBeenCalledWith({
        title: 'Docker 清理',
        content: 'docker system prune',
        tags: ['a', 'b', 'c'],
        kind: 'CODE',
      }),
    );
    expect(h.onSaved).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
  });

  it('loads then updates an existing snippet', async () => {
    const { kb } = installKb([snip(5, 'old', 'body', { tags: ['x', 'y'], kind: 'CLIP' })]);
    const h = handlers();
    render(<SnippetEditor id={5} {...h} />);
    expect(await screen.findByDisplayValue('old')).toBeInTheDocument();
    expect(kb.getSnippet).toHaveBeenCalledWith(5);
    expect(screen.getByLabelText('标签')).toHaveValue('x, y');
    expect(screen.getByLabelText('类型')).toHaveValue('CLIP');
    await userEvent.clear(screen.getByLabelText('标题'));
    await userEvent.type(screen.getByLabelText('标题'), 'new');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(kb.updateSnippet).toHaveBeenCalledWith(5, { title: 'new', content: 'body', tags: ['x', 'y'], kind: 'CLIP' }),
    );
    expect(h.onSaved).toHaveBeenCalled();
  });

  it('shows field errors from the kernel under the field', async () => {
    const { kb } = installKb();
    kb.createSnippet.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        error: { status: 400, error: 'VALIDATION_FAILED', message: 'request validation failed', fieldErrors: [{ field: 'title', message: 'title is required' }] },
      }) as never,
    );
    const h = handlers();
    render(<SnippetEditor {...h} />);
    await userEvent.type(screen.getByLabelText('标题'), ' ');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('title is required')).toBeInTheDocument();
    expect(h.onSaved).not.toHaveBeenCalled();
  });

  it('confirms inline before deleting', async () => {
    const { kb } = installKb([snip(5, 'old')]);
    const h = handlers();
    render(<SnippetEditor id={5} {...h} />);
    await screen.findByDisplayValue('old');
    await userEvent.click(screen.getByRole('button', { name: '删除' }));
    await userEvent.click(screen.getByRole('button', { name: '取消删除' }));
    expect(kb.deleteSnippet).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '删除' }));
    await userEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(kb.deleteSnippet).toHaveBeenCalledWith(5));
    expect(h.onDeleted).toHaveBeenCalled();
  });
});
