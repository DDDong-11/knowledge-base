import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { installKb } from './mockKb';

describe('App', () => {
  it('lists recent snippets on start and focuses search', async () => {
    const { kb } = installKb();
    render(<App />);
    expect(await screen.findByText('Docker 清理')).toBeInTheDocument();
    expect(kb.listSnippets).toHaveBeenCalledWith({ size: 20 });
    expect(screen.getByRole('searchbox', { name: '搜索' })).toHaveFocus();
    expect(await screen.findByText('内核正常 · 端口 17321')).toBeInTheDocument();
  });

  it('debounces search input', async () => {
    const { kb } = installKb();
    render(<App />);
    await screen.findByText('Docker 清理');
    await userEvent.type(screen.getByRole('searchbox', { name: '搜索' }), 'docker');
    await waitFor(() => expect(kb.search).toHaveBeenCalledWith('docker', { limit: 50 }));
    await new Promise((r) => setTimeout(r, 300));
    expect(kb.search).toHaveBeenCalledTimes(1);
  });

  it('kind filter applies to list and search', async () => {
    const { kb } = installKb();
    render(<App />);
    await screen.findByText('Docker 清理');
    await userEvent.click(screen.getByRole('button', { name: '代码' }));
    await waitFor(() => expect(kb.listSnippets).toHaveBeenCalledWith({ size: 20, kind: 'CODE' }));
    expect(screen.getByRole('button', { name: '代码' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.type(screen.getByRole('searchbox', { name: '搜索' }), 'git');
    await waitFor(() => expect(kb.search).toHaveBeenCalledWith('git', { kind: 'CODE', limit: 50 }));
  });

  it('copy shows toast then hides panel', async () => {
    const { kb } = installKb();
    render(<App />);
    await screen.findByText('Docker 清理');
    await userEvent.click(screen.getAllByRole('button', { name: /^复制/ })[0]);
    expect(kb.copyText).toHaveBeenCalledWith('docker system prune -af');
    expect(await screen.findByText('已复制')).toBeInTheDocument();
    expect(kb.hidePanel).not.toHaveBeenCalled();
    await waitFor(() => expect(kb.hidePanel).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });

  it('arrow down + Enter copies the second item', async () => {
    const { kb } = installKb();
    render(<App />);
    await screen.findByText('Git 回滚');
    const box = screen.getByRole('searchbox', { name: '搜索' });
    await userEvent.type(box, '{ArrowDown}{Enter}');
    expect(kb.copyText).toHaveBeenCalledWith('git reset --hard HEAD~1');
  });

  it('Esc clears query first, then hides panel', async () => {
    const { kb } = installKb();
    render(<App />);
    await screen.findByText('Docker 清理');
    const box = screen.getByRole('searchbox', { name: '搜索' });
    await userEvent.type(box, 'abc');
    await userEvent.keyboard('{Escape}');
    expect(box).toHaveValue('');
    expect(kb.hidePanel).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(kb.hidePanel).toHaveBeenCalledTimes(1);
  });

  it('shows an error banner when the kernel is down', async () => {
    const { kb } = installKb();
    kb.listSnippets.mockImplementation(() =>
      Promise.resolve({ ok: false, error: { status: 503, error: 'KERNEL_UNREACHABLE', message: 'down' } }) as never,
    );
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('down');
    await userEvent.click(screen.getByRole('button', { name: '关闭错误' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refreshes when the panel is shown again', async () => {
    const { kb, firePanelShown } = installKb();
    render(<App />);
    await screen.findByText('Docker 清理');
    const before = kb.listSnippets.mock.calls.length;
    act(() => firePanelShown());
    await waitFor(() => expect(kb.listSnippets.mock.calls.length).toBeGreaterThan(before));
    expect(kb.health.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('opens the editor with ＋ and returns to the list after saving', async () => {
    const { kb } = installKb();
    render(<App />);
    await screen.findByText('Docker 清理');
    await userEvent.click(screen.getByRole('button', { name: '新建' }));
    await userEvent.type(screen.getByLabelText('标题'), 'new one');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(kb.createSnippet).toHaveBeenCalled());
    expect(await screen.findByRole('searchbox', { name: '搜索' })).toBeInTheDocument();
  });
});
