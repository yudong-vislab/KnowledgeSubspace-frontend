<!-- src/components/LeftPane.vue -->
<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'
import ChatDock from './ChatDock.vue'
import * as d3 from 'd3';
import { sendQueryToLLM } from '../lib/api'   // ★★ 新增：调用后端 /api/query

const selectedLLM = ref('ChatGPT')
const llmOptions = ['ChatGPT', 'QWen']

// 建议 messages 里统一使用 {role, text}，发给后端时做映射
const messages = ref([
  { role: 'system', text: 'You are chatting with an academic assistant.' }
])

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

async function handleSend(msg) {
  messages.value.push({ role: 'user', text: msg })
  try {
    const answer = await sendQueryToLLM(msg, selectedLLM.value)
    messages.value.push({ role: 'assistant', text: answer })
  } catch (err) {
    messages.value.push({ role: 'assistant', text: `调用失败：${err.message}` })
  }
}


function handleUploadFiles(files) { /* … */ }

// **************************************************************
//write by: lc
//date: 2025-09-03
//使用d3绘制paperList
// D3.js 图表逻辑
let selectedPaperIndexs = []; // 全局数组记录选中的 paper_id
const chartContainerRef = ref(null);
// 眼睛图标的 SVG 路径数据
const eyePathData = "M12 4.5c-6.627 0-12 7.072-12 7.5s5.373 7.5 12 7.5 12-7.072 12-7.5-5.373-7.5-12-7.5zm0 12c-2.485 0-4.5-2.015-4.5-4.5s2.015-4.5 4.5-4.5 4.5 2.015 4.5 4.5-2.015 4.5-4.5 4.5zm0-7.5c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3z";

function generateRandomData() {
  const domains = ["Chemistry", "Society", "Visualization"];
  let globalIndex = 1;

  function randomPaper(index) {
    // 模拟图片路径
    const images = [
      '2025-09-03_152404.png',
      '2025-09-03_152507.png',
      '2025-09-03_152535.png',
      '2025-09-03_152602.png'
    ].map(fileName => {
      // `../assets/pictures/` 是相对于当前组件文件而言的相对路径
      return new URL(`../assets/pictures/${fileName}`, import.meta.url).href;
    });
    // 模拟 PDF 文件路径和名称
    const filenames = [
      '2019-Air pollution a global problem needs local fixes.pdf',
      '2019-AirInsight Visual Exploration and Interpretation of Latent Patterns and Anomalies in Air Quality Data.pdf',
      '2019-AirVis Visual Analytics of Air Pollution Propagation.pdf',
      '2019-Visual Exploration of Air Quality Data with a Time-correlation-partitioning Tree Based on Information Theory.pdf'
    ];

    const pdfs = filenames.map(filename => {
      return new URL(`../assets/pdf/${filename}`, import.meta.url).href;
    });

    const randomImage = images[Math.floor(Math.random() * images.length)];
    const randomPdfUrl = pdfs[Math.floor(Math.random() * pdfs.length)];
    const paperName = `Paper ${globalIndex}`;

    return {
      name: paperName,
      id: `${index}`,
      globalIndex: globalIndex++,
      year: (2000 + Math.floor(Math.random() * 26)).toString(),
      count: Math.floor(Math.random() * 40),
      content: randomImage, // 使用 content 字段存储图片路径
      pdfUrl: randomPdfUrl,
      domain: domains[Math.floor(Math.random() * domains.length)]
    };
  }

  return domains.map(domain => {
    const paperCount = Math.floor(Math.random() * 8) + 1;
    const papers = Array.from({ length: paperCount }, (_, i) => ({
      ...randomPaper(i + 1),
      domain: domain
    }));
    return {
      domain,
      value: papers,
      Total: paperCount.toString()
    };
  });
}

function drawChart() {
  const chartData = generateRandomData();
  console.log("data:", chartData);

  // 创建颜色比例尺
  const domains = ["Chemistry", "Society", "Visualization"];
  const colors = ["#69b3a2", "#e69f00", "#56b4e9"];
  const colorScale = d3.scaleOrdinal()
    .domain(domains)
    .range(colors);

  // 计算所有分组的论文总数
  const totalPaperCount = d3.sum(chartData, d => d.value.length);

  const groupPadding_left = 50;
  const groupPadding_top = 10;
  const rectWidth = 34;
  const rectHeight = 45;
  const rectPadding_x = 10;
  const rectPadding_y = 25;
  const rectsPerRow = 5;

  const container = d3.select("#paperlistContent");
  const containerWidth = container.node().clientWidth;
  const margin = { top: 10, left: 10, right: 20, bottom: 0 };
  const svgWidth = containerWidth - margin.right;

  container.html(''); // 清空旧内容

  chartData.forEach((domainData, domainIndex) => {
    const groupDiv = container.append("div");
    const paperCount = domainData.value.length;
    const rows = Math.ceil(paperCount / rectsPerRow);
    const svgHeight = (rectHeight + rectPadding_y) * rows + groupPadding_top;

    const svg = groupDiv.append("svg")
      .attr("width", svgWidth)
      .attr("height", svgHeight);

    const defs = svg.append("defs");

    // 为每个数据项创建一个独立的 pattern
    defs.selectAll("pattern")
      .data(domainData.value)
      .enter()
      .append("pattern")
      .attr("id", d => `image-pattern-${d.globalIndex}`) // 使用唯一 globalIndex
      .attr("width", 1)
      .attr("height", 1)
      .attr("patternContentUnits", "objectBoundingBox")
      .append("image")
      .attr("xlink:href", d => d.content) // 使用 content 作为图片路径
      .attr("width", 1)
      .attr("height", 1)
      .attr("preserveAspectRatio", "xMidYMid slice");

    const rectGroup = svg.append("g")
      .attr("transform", `translate(${groupPadding_left},${0})`);

    const paperGroup = rectGroup.selectAll("g.paper-group")
      .data(domainData.value)
      .enter()
      .append("g")
      .attr("class", "paper-group")
      .attr("data-global-index", d => d.globalIndex) // 添加 data 属性
      .attr("transform", (d, i) => {
        const col = i % rectsPerRow;
        const row = Math.floor(i / rectsPerRow);
        const x = col * (rectWidth + rectPadding_x);
        const y = groupPadding_top + row * (rectHeight + rectPadding_y);
        return `translate(${x},${y})`;
      });

    // 绘制矩形
    paperGroup.append("rect")
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("width", rectWidth)
      .attr("height", rectHeight)
      // 使用颜色比例尺来填充边框
      .attr("stroke", d => colorScale(d.domain))
      .attr("stroke-width", 2)
      .style("opacity", 1)
      .attr("fill", d => `url(#image-pattern-${d.globalIndex})`)
      .style("cursor", "pointer")
      .on("mousemove", (event, d) => {
        d3.select("#paperlistTooltip")
          .style("display", "block")
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY + 10) + "px")
          .html(`
                            <strong>ID:</strong> ${d.id}<br/>
                            <strong>Year:</strong> ${d.year}<br/>
                            <strong>Count:</strong> ${d.count}
                        `);
      })
      .on("mouseout", (event, d) => {
        d3.select("#paperlistTooltip").style("display", "none");
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        const index = selectedPaperIndexs.indexOf(d.globalIndex);

        if (index > -1) {
          // 如果已存在，移除
          selectedPaperIndexs.splice(index, 1);
        } else {
          // 如果不存在，添加
          selectedPaperIndexs.push(d.globalIndex);
        }

        // 重新更新所有论文的透明度
        d3.selectAll(".paper-group")
          .style("opacity", (paperData) => {
            // 如果selectedPaperIndexs为空，所有论文都恢复正常
            if (selectedPaperIndexs.length === 0) {
              return 1;
            }
            // 如果论文的 globalIndex 在选中数组中，则透明度为1
            if (selectedPaperIndexs.includes(paperData.globalIndex)) {
              return 1;
            } else {
              // 否则，透明度为0.5
              return 0.5;
            }
          });
      });

    paperGroup.append("text")
      .attr("text-anchor", "middle")
      .attr("font-size", "8px")
      .attr("fill", "#000")
      .attr("x", rectWidth / 2)
      .attr("y", rectHeight + 10)
      .each(function (d) {
        d3.select(this).append("tspan")
          .attr("x", d3.select(this).attr("x"))
          .attr("dy", 0)
          .text(`ID:${d.id}`);
      });

    paperGroup.append("path")
      .attr("d", eyePathData)
      .attr("transform", `scale(0.5) translate(${rectWidth / 0.5 / 2 - 10}, ${rectHeight / 0.5 + 20})`)
      .style("cursor", "pointer")
      .style("fill", "#D3D3D3")
      .on("click", (event, d) => {
        event.stopPropagation();
        showPdfModal(d.pdfUrl, d.name);
      })
      .on("mouseover", function () {
        d3.select(this).style("fill", "#007bff");
      })
      .on("mouseout", function () {
        d3.select(this).style("fill", "#D3D3D3");
      });


    // 绘制半圆饼图
    const pieinnerRadius = 14;
    const pieouterRadius = 20;
    const pieGroup = svg.append("g")
      .attr("transform", `translate(25, ${groupPadding_top * 4})`);

    const pieData = d3.pie()
      .sort(null)
      .startAngle(-Math.PI / 2)
      .endAngle(Math.PI / 2)
      .value(d => d)([paperCount, totalPaperCount - paperCount]);

    const arcGenerator = d3.arc()
      .innerRadius(pieinnerRadius)
      .outerRadius(pieouterRadius);

    const arcColors = [colorScale(domainData.domain), "#ddd"];

    pieGroup.selectAll("path")
      .data(pieData)
      .enter()
      .append("path")
      .attr("d", arcGenerator)
      .attr("fill", (d, i) => arcColors[i]);

    // 将文本拆分为两行
    const pieText = pieGroup.append("text")
      .attr("text-anchor", "middle")
      .attr("fill", "#000");

    pieText.append("tspan")
      .attr("x", 0)
      .attr("dy", 0)
      .attr("font-size", "10px")
      .text(`${paperCount}/${totalPaperCount}`);

    pieText.append("tspan")
      .attr("x", 0)
      .attr("dy", "1.2em") // 往下移动一行
      .attr("font-size", "8px")
      .attr("font-weight", "bold")
      .attr("fill", colorScale(domainData.domain))
      .text(domainData.domain);


    if (domainIndex < chartData.length - 1) {
      svg.append("line")
        .attr("x1", margin.left)
        .attr("y1", svgHeight)
        .attr("x2", svgWidth - margin.right / 2)
        .attr("y2", svgHeight)
        .attr("stroke", "black")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "4 2");
    }
  });

  d3.select("#closeModalBtn").on("click", hidePdfModal);
  d3.select("#modalOverlay").on("click", (event) => {
    if (event.target === d3.select("#modalOverlay").node()) {
      hidePdfModal();
    }
  });


}

onMounted(() => {
  drawChart();
  // 监听容器大小变化，重新绘制图表
  new ResizeObserver(drawChart).observe(chartContainerRef.value);
});

function showPdfModal(pdfUrl, pdfName) {
  const modalOverlay = d3.select("#modalOverlay");
  const pdfFrame = d3.select("#pdfFrame");
  const pdfTitle = d3.select("#pdfTitle");

  pdfTitle.text(pdfName);
  pdfFrame.attr("src", pdfUrl);
  modalOverlay.style("display", "flex");
}

function hidePdfModal() {
  const modalOverlay = d3.select("#modalOverlay");
  const pdfFrame = d3.select("#pdfFrame");
  const pdfTitle = d3.select("#pdfTitle");

  pdfFrame.attr("src", "");
  pdfTitle.text("PDF Viewer");
  modalOverlay.style("display", "none");

}

async function onSelectPaper() {
  console.log("Selected Paper Indexs:", selectedPaperIndexs);
  alert("Selected Paper Indexs: " + selectedPaperIndexs.join(", "));
}
async function onClearPaper() {
  // 清空已选数组
  console.log("ffffffffffffffgg");
  selectedPaperIndexs = [];
  d3.selectAll(".paper-group").style("opacity", 1);
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
      <div id="paperlistContent" style="width: 318px; height: 190px; overflow: auto;"></div>

      <div id="modalOverlay" style="z-index: 99999;">
        <div id="pdfModal">
          <span id="closeModalBtn">&times;</span>
          <h3 id="pdfTitle">PDF Viewer</h3>
          <iframe id="pdfFrame"></iframe>
        </div>
      </div>

      <div id="paperlistTooltip"></div>
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

/* 遮罩层样式 */
#modalOverlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: none;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

/* 模态框样式 */
#pdfModal {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  width: 80%;
  max-width: 800px;
  height: 80%;
  position: relative;
  display: flex;
  flex-direction: column;
  z-index: 9999;
}

#pdfModal iframe {
  flex-grow: 1;
  border: none;
  z-index: 9999;
}

/* 关闭按钮样式 */
#closeModalBtn {
  position: absolute;
  top: 15px;
  right: 15px;
  font-size: 24px;
  cursor: pointer;
  color: #333;
  z-index: 9999;
}

/* 原始代码的样式 */
#paperlistTooltip {
  position: absolute;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
  display: none;
}
</style>