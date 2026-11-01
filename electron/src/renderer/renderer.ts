// 临时联调页（第 5 步 Task 4 将替换为 React 面板）
function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

function show(id: string, value: unknown): void {
  $(id).textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function main(): Promise<void> {
  try {
    const meta = await window.kb.meta();
    $('meta').textContent = meta.ok
      ? `内核端口：${meta.data.port}（经主进程 HTTP，带 X-KB-Token）`
      : `meta 失败：${meta.error.message}`;
  } catch (e) {
    $('meta').textContent = `meta 失败：${e instanceof Error ? e.message : e}`;
  }

  $('btn-health').addEventListener('click', async () => {
    try {
      show('out-health', await window.kb.health());
    } catch (e) {
      show('out-health', e instanceof Error ? e.message : e);
    }
  });

  $('btn-create').addEventListener('click', async () => {
    const title = ($('title') as HTMLInputElement).value.trim();
    const content = ($('content') as HTMLTextAreaElement).value;
    const tagsRaw = ($('tags') as HTMLInputElement).value;
    const tags = tagsRaw
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      show('out-create', await window.kb.createSnippet({ title, content, tags }));
    } catch (e) {
      show('out-create', e instanceof Error ? e.message : e);
    }
  });

  $('btn-search').addEventListener('click', async () => {
    const q = ($('q') as HTMLInputElement).value.trim();
    try {
      show('out-search', await window.kb.search(q, { limit: 20 }));
    } catch (e) {
      show('out-search', e instanceof Error ? e.message : e);
    }
  });
}

void main();
