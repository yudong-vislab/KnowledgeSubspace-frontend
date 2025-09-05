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

// 新增：总结MSU句子的函数
export async function summarizeMsuSentences(sentences) {
  const prompt = `Please provide a concise and accurate summary based on the following academic text fragments. Requirements:
1. Summarize core ideas and key information in English
2. Keep within 50 words
3. Highlight research focus and conclusions
4. Avoid redundant descriptions

Text content: ${sentences.join('\n')}`;

  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ 
        query: prompt, 
        model: 'gpt-3.5-turbo',
        max_tokens: 100
      })
    });
    
    if (!res.ok) {
      throw new Error('API request failed');
    }
    
    const data = await res.json();
    return data.answer || 'Summary generation failed';
  } catch (error) {
    console.error('Summary generation error:', error);
    return 'Generating summary...';
  }
}

