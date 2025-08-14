<!-- src/components/RightPane.vue -->
<template>
  <div class="rp-shell">
    <!-- 上部：1 份高度 -->
    <section class="rp-card">
      <header class="rp-card__title">Step Analysis</header>
      <div class="rp-card__body">
        <!-- 你的属性面板内容 -->
      </div>
    </section>

    <!-- 下部：2 份高度 -->
    <section class="rp-card">
      <header class="rp-card__title">Details</header>
      <div class="rp-card__body">
        <!-- 你的详情、日志等内容 -->
      </div>
    </section>
  </div>
</template>

<style scoped>
/* 外层：灰色底、上下栅格 1:2、统一内边距与卡片间距 */
.rp-shell {
  height: 100%;
  display: grid;
  grid-template-rows: 1fr 2fr;  /* 上:下 = 1:2 */
  gap: 6px;                    /* 上下间距 */
  background: #f3f4f6;          /* 浅灰底色 */
  box-sizing: border-box;
}

/* 卡片：白底、圆角、阴影、竖向布局 */
.rp-card {
  background: #fff;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  min-height: 0;                 /* 让内部可滚 */
}

/* 标题行：与内容分隔清晰 */
.rp-card__title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  border-bottom: 1px solid #eee;
  padding: 8px;
}

/* 内容区：可滚动，边距统一 */
.rp-card__body {
  padding: 10px;
  overflow: auto;
  min-height: 0;
}
</style>
