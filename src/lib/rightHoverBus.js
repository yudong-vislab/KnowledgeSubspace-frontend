// 右侧 LinkCard 之间共享 hover 的极简事件总线
const subs = new Set();

/** 订阅：返回取消函数 */
export function onRightHover(cb) {
  subs.add(cb);
  return () => subs.delete(cb);
}

/** 广播当前 hover 的全局节点 id（'panelIdx:q,r'），或 null 清除 */
export function emitRightHover(id) {
  subs.forEach(fn => { try { fn(id); } catch (_) {} });
}
