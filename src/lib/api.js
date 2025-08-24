export async function fetchSemanticMap() {
  const res = await fetch('/api/semantic-map');
  if (!res.ok) throw new Error('Failed to load semantic map');
  return res.json();
}

export async function createSubspace(payload) {
  const res = await fetch('/api/subspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
  if (!res.ok) throw new Error('Failed to create subspace');
  return res.json();
}

export async function renameSubspace(idx, name) {
  const res = await fetch(`/api/subspaces/${idx}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subspaceName: name })
  });
  if (!res.ok) throw new Error('Failed to rename subspace');
  return res.json();
}

export async function renameMapTitle(newTitle){
  // 按你的真实 API 调整 URL / method / body
  await fetch('/api/semantic-map/title', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ title: newTitle })
  })
}

export async function sendQueryToLLM(query, llm = 'ChatGPT') {
  const res = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ query, model: llm === 'QWen' ? 'qwen-turbo' : 'gpt-3.5-turbo' })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data.answer;
}

