// src/lib/selectionBus.js

// —— 实时选中（预览）总线 —— //
const subsLive = new Set();
/**
 * 订阅“实时选中集”变化（例如 hover/点击后右侧即时预览）
 * @param {(payload:{nodes:any[], links:any[]})=>void} fn
 * @returns {()=>void}
 */
export function onSelectionChange(fn) {
  subsLive.add(fn);
  return () => subsLive.delete(fn);
}
/** 推送实时选中集 */
export function emitSelection(payload) {
  const p = payload || { nodes: [], links: [] };
  subsLive.forEach(fn => { try { fn(p); } catch(e){ console.warn(e); } });
}

// —— Save 后“步骤快照”总线 —— //
const subsSaved = new Set();
/**
 * 订阅“保存步骤”的事件（点 Save 后堆叠到右侧 Steps）
 * @param {(payload:{
 *   title?: string, createdAt?: number,
 *   nodes:any[], links:any[],
 *   rawText?: string, summary?: string, meta?: any
 * })=>void} fn
 * @returns {()=>void}
 */
export function onSelectionSaved(fn) {
  subsSaved.add(fn);
  return () => subsSaved.delete(fn);
}
/** 推送保存的步骤快照 */
export function emitSelectionSaved(payload) {
  const p = payload || { nodes: [], links: [] };
  subsSaved.forEach(fn => { try { fn(p); } catch(e){ console.warn(e); } });
}
