// src/api/chat.js
export async function chatOnce({ query, messages } = {}) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ query, messages, stream: false })
  });
  if (!res.ok) {
    const err = await res.json().catch(()=> ({}));
    throw new Error(err.error || `Chat failed: ${res.status}`);
  }
  return res.json(); // { id, answer, usage? }
}

// 可选：流式（SSE）
export function chatStream({ query, messages } = {}, onDelta, onDone, onError) {
  const es = new EventSourcePolyfill('/api/chat_stream_sse_not_used'); // 占位：我们直接用 /api/chat + SSE
  // 上面这种写法不需要。真正做法：直接用 fetch + Response.body 读流或用原生 EventSource
  // 但 Flask 返回的是 text/event-stream，建议用原生 EventSource：
}

export function chatSSE({ query, messages }, { onDelta, onDone, onError }){
  const url = '/api/chat';
  const es = new EventSourcePolyfill ? new EventSourcePolyfill(url) : null; // 如果你用 polyfill
  // 更简单：用原生 EventSource 前提是 GET。我们现在是 POST，所以推荐非流式或改成 GET+queryString。
  // 为了不引入复杂度，建议先用非流式 chatOnce。
}
