<!-- src/components/LeftPane.vue -->
<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'
import ChatDock from './ChatDock.vue'
import * as d3 from 'd3';

const selectedLLM = ref('ChatGPT')
const llmOptions = ['ChatGPT', 'QWen']

const messages = ref([{ role: 'system', text: 'First...' }])

const msgBoxRef = ref(null)
const atBottom = ref(true)

function isNearBottom(el, threshold = 80) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
}
function scrollToBottom(behavior = 'smooth') {
  const el = msgBoxRef.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior })
}
function onMsgsScroll(e) {
  atBottom.value = isNearBottom(e.target)
}
onMounted(() => nextTick(() => scrollToBottom('instant')))
watch(() => messages.value.length, async () => {
  await nextTick()
  if (atBottom.value) scrollToBottom('smooth')
})

function handleSend(msg) {
  messages.value.push({ role: 'user', text: msg })
  setTimeout(() => messages.value.push({ role: 'assistant', text: 'Received...' }), 300)
}
function handleUploadFiles(files) { /* … */ }

// **************************************************************
//write by: lc
//date: 2025-08-19
//使用d3绘制paperList
// D3.js 图表逻辑
let selectedPaperIDs = []; // 全局数组记录选中的 paper_id
let rectDefaultColor = {}; // 保存每个rect默认颜色，方便恢复
let selectedPapers = [];
const chartContainerRef = ref(null);
let colorScale = [];

function generateRandomData() {
  const categories = ['Methods', 'Results', 'Subspace3', 'Subspace4', 'Subspace5', 'Subspace6'];
  const data = [];
  const overallStartYear = 1990;
  const overallEndYear = 2025;

  categories.forEach(category => {
    const categoryData = { category: category, Val: [] };
    const startYear = overallStartYear + Math.floor(Math.random() * (overallEndYear - overallStartYear));
    const endYear = startYear + 1 + Math.floor(Math.random() * (overallEndYear - startYear));
    const years = Array.from({ length: endYear - startYear }, (_, i) => startYear + i);

    years.forEach(year => {
      const paperCount = Math.floor(Math.random() * 8) + 1;
      const paperlist = Array.from({ length: paperCount }, (_, i) => ({
        paper_id: Math.floor(Math.random() * 1000),
        paper_source: `Paper-${Math.random().toString(36).substring(7)}`
      }));
      categoryData.Val.push({ year: year, paperlist: paperlist });
    });

    data.push(categoryData);
  });
  return data;
}

function drawChart() {
  const chartData = generateRandomData();
  console.log("data:", chartData);

  const margin = { top: 4, right: 10, bottom: 10, left: 40 };
  const tooltip = d3.select("#paperlistTooltip");

  // 固定参数
  const rectWidth = 6;      // 每个年份的宽度
  const rectPadding = 2;     // 年份之间间隔
  const groupHeight = 40;    // 每组高度
  const groupPadding = 30;   // 每组之间间隔

  // 1. 全局年份范围
  const allYears = chartData.flatMap(c => c.Val.map(v => v.year));
  const yearExtent = d3.extent(allYears);
  const yearRange = d3.range(yearExtent[0], yearExtent[1] + 1);

  // 2. 全局最大论文数
  const maxPaperCount = d3.max(chartData, c =>
    d3.max(c.Val, v => v.paperlist.length)
  );

  // === 自动计算 SVG 尺寸 ===
  const svgWidth = margin.left*2 + margin.right + yearRange.length * (rectWidth + rectPadding);
  const svgHeight = margin.top + margin.bottom + chartData.length * (groupHeight + groupPadding);

  // 外层容器
  d3.select(chartContainerRef.value).select("svg").remove();

  const container = d3.select(chartContainerRef.value);

  const svg = container.append("svg")
    .attr("width", svgWidth)
    .attr("height", svgHeight)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // 比例尺
  const xScale = d3.scaleBand()
    .domain(yearRange)
    .range([0, yearRange.length * (rectWidth + rectPadding)])
    .padding(0.1);

  const yScale = d3.scaleLinear()
    .domain([0, maxPaperCount])
    .range([groupHeight, 0]);

  colorScale = d3.scaleOrdinal()
    .domain(chartData.map(d => d.category))
    .range(d3.schemeSet3);

  // 每组子图
  chartData.forEach((categoryData, i) => {
    const categoryGroup = svg.append("g")
      .attr("transform", `translate(0, ${i * (groupHeight + groupPadding)})`);

    // 横轴（每 5 年一个 tick）
    const representativeTicks = d3.range(yearExtent[0], yearExtent[1] + 1, 5);
    const xAxis = d3.axisBottom(xScale)
      .tickValues(representativeTicks)
      .tickSize(3)
      .tickSizeOuter(0)
      .tickFormat(d3.format("d"));

    categoryGroup.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(${margin.left * 0.4}, ${groupHeight})`)
      .call(xAxis);

    // 纵轴
    const yAxis = d3.axisLeft(yScale).ticks(4).tickSize(3).tickSizeOuter(0);
    categoryGroup.append("g")
      .attr("transform", `translate(${margin.left * 0.4}, ${0})`)
      .attr("class", "y-axis")
      .call(yAxis);

    // 绘制每一年下的所有 paper rect
    categoryData.Val.forEach(yearData => {
      categoryGroup.selectAll(`.rect-${yearData.year}`)
        .data(yearData.paperlist)
        .join("rect")
        .each(d => { d.category = categoryData.category; })  // 给每个 d 添加 category
        .attr("class", `rect-${yearData.year}`)
        .attr("x", margin.left * 0.4 + xScale(yearData.year) + xScale.bandwidth() / 4 - rectPadding / 2)
        .attr("y", (d, j) => yScale(j + 1))
        .attr("width", rectWidth)
        .attr("height", groupHeight / maxPaperCount)
        .attr("fill", d => {
          const defaultColor = colorScale(categoryData.category);
          rectDefaultColor[d.paper_id] = defaultColor; // 保存默认颜色
          return defaultColor;
        })
        .attr("rx", 1)
        .attr("ry", 1)
        .style("stroke", "#333")
        .style("stroke-width", 0.8)
        .on("mouseover", function (event, d) {
          tooltip.style("display", "block")
            .html(`Paper ID: ${d.paper_id}<br>Source: ${d.paper_source}`);

          // 鼠标悬停变暗，但如果已选红色，则不变
          if (!selectedPaperIDs.includes(d.paper_id)) {
            d3.select(this).attr("fill", d3.rgb(colorScale(categoryData.category)).darker(1));
          }
        })
        .on("mousemove", function (event) {
          tooltip.style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY + 10) + "px");
        })
        .on("mouseout", function (event, d) {
          tooltip.style("display", "none");

          // 只有未选中的 rect 才恢复默认色
          if (!selectedPaperIDs.includes(d.paper_id)) {
            d3.select(this).attr("fill", colorScale(categoryData.category));
          }
        })
        .on("click", function (event, d) {
          const index = selectedPaperIDs.indexOf(d.paper_id);
          if (index === -1) {
            selectedPaperIDs.push(d.paper_id);  // 记录点击
            d3.select(this).attr("fill", "red"); // 变红
            selectedPapers.push({ paper_id: d.paper_id, category: categoryData.category });
          } else {
            selectedPaperIDs.splice(index, 1);   // 取消选择
            d3.select(this).attr("fill", colorScale(categoryData.category)); // 恢复默认色
          }
        });

      ;
    });

    // 类别标题
    categoryGroup.append("text")
      .attr("x", -margin.left)
      .attr("y", 20)
      .attr("font-weight", "bold")
      .attr("font-size", 10)
      .text(categoryData.category);
  });
}

onMounted(() => {
  drawChart();
  // 监听容器大小变化，重新绘制图表
  new ResizeObserver(drawChart).observe(chartContainerRef.value);
});

async function onSelectPaper() {
  console.log("Selected Paper IDs:", selectedPaperIDs);
  alert("Selected Paper IDs: " + selectedPaperIDs.join(", "));
}
async function onClearPaper() {
  // 清空已选数组
  selectedPaperIDs = [];

  // 遍历所有 rect，恢复颜色
  d3.selectAll("rect").each(function (d) {
    if (d && d.category) {
      d3.select(this).attr("fill", colorScale(d.category));
    }
  });
}
// **************************************************************

</script>

<template>
  <div class="lp-shell">
    <!-- 1) Parameters（包含 LLM 选择） -->
    <section class="lp-card">
      <header class="card__title">Control Panel</header>

      <!-- 顶部工具条：选择大模型 -->
      <div class="param-toolbar">
        <span class="label">Selected LLM:</span>
        <select class="lp-select" v-model="selectedLLM">
          <option v-for="o in llmOptions" :key="o" :value="o">{{ o }}</option>
        </select>
      </div>

      <!-- 参数主体内容 -->
      <div class="lp-card__body">
        <p>…</p>
      </div>
    </section>

    <!-- 2) 论文列表 -->
    <section class="lp-card">
      <header class="card__title">Paper List
        <div class="mv-actions">
          <button class="select-btn" id="SelectBtn" @click="onSelectPaper">Select</button>
          <button class="clear-btn" id="ClearBtn" @click="onClearPaper">Clear</button>
        </div>
      </header>
      <div class="lp-card__body scroll-auto-hide" ref="chartContainerRef"></div>
      <div id="paperlistTooltip" class="paper-tooltip"></div>
    </section>

    <!-- 3) 对话区（消息 + 输入条） -->
    <section class="lp-card lp-chat">
      <header class="card__title">Chat with LLM</header>

      <div ref="msgBoxRef" class="lp-msgs" @scroll="onMsgsScroll">
        <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
          <div class="msg-bubble">{{ m.text }}</div>
        </div>
      </div>

      <ChatDock @send="handleSend" @upload-files="handleUploadFiles" />
    </section>
  </div>
</template>

<style scoped>
/* —— 布局：改为 3 行 —— */
.lp-shell {
  height: 100%;
  display: grid;
  grid-template-rows: 1fr 1.2fr 2fr;
  /* Parameters / Paper / Chat */
  gap: 6px;
  background: #f3f4f6;
  box-sizing: border-box;
  overflow: hidden;
}

/* —— 通用卡片 —— */
.lp-card {
  --r: 12px;
  background: #fff;
  border-radius: var(--r);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  /* 让内部滚动条被圆角裁切 */
}

/* .lp-card__title{
  font-size:14px;
  font-weight:600;
  color:#333;
  border-bottom:1px solid #eee;
  padding:8px 10px;
} */
.lp-card__body {
  padding: 5px 0;
  overflow: auto;
  min-height: 0;
  border-bottom-left-radius: var(--r);
  border-bottom-right-radius: var(--r);
  background-clip: padding-box;
}

/* —— Parameters 顶部工具条（替代原 lp-title） —— */
.param-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 0;
  /* 与卡片边缘对齐，靠上放 */
}

.param-toolbar .label {
  font-size: 11px;
  color: #555;
}

.lp-select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  font-size: 11px;
  line-height: 1;
  padding: 6px 24px 6px 10px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #111;
  cursor: pointer;
}

.lp-select:focus {
  outline: none;
  box-shadow: 0 0 0 3px #eef2ff;
  border-color: #c7d2fe;
}

/* —— Paper 列表占位 —— */
.fake-list {
  margin: 0;
  padding-left: 18px;
}

.fake-list li {
  line-height: 1.8;
}

/* —— Chat 区域 —— */
.lp-chat {
  display: grid;
  grid-template-rows: auto 1fr auto;
  /* 头 / 消息 / 输入条 */
  overflow: hidden;
}

.lp-msgs {
  padding: 10px 2px;
  overflow: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  scrollbar-gutter: stable both-edges;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.lp-msgs::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.lp-msgs::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 4px;
}

.lp-msgs::-webkit-scrollbar-track {
  background: transparent;
}

.lp-msgs:hover {
  scrollbar-color: rgba(0, 0, 0, .25) transparent;
}

.lp-msgs:hover::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, .25);
}

/* 气泡 */
.msg {
  display: flex;
}

.msg.user {
  justify-content: flex-end;
}

.msg .msg-bubble {
  max-width: 90%;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 11px;
  background: #f3f4f6;
}

.msg.user .msg-bubble {
  background: #111;
  color: #fff;
}

.paper-tooltip {
  position: absolute;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
  display: none;
}

/* 右侧按钮容器：横向排列、保持右对齐 */
.mv-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  /* 两个按钮间距 */
  float: right;
}
</style>
