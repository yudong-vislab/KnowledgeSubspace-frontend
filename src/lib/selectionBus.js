// 超轻量事件总线：主视图把当前 selection 推过来；右侧订阅它
const subs = new Set();

/**
 * 订阅选中数据变化
 * @param {(payload:{nodes:any[], links:any[]})=>void} fn
 * @returns {()=>void} 取消订阅函数
 */
export function onSelectionChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/**
 * 主视图调用：推送新的选中集
 * @param {{nodes:any[], links:any[]}} payload
 */
export function emitSelection(payload) {
  subs.forEach(fn => {
    try { fn(payload || {nodes:[], links:[]}); } catch(e){ console.warn(e); }
  });
}
