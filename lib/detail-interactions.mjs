import { filterTagIndex } from "./tag-index.mjs";

const ROADMAP_CURRENT_NODE_KEY = "algo-journal-roadmap-current-node";

function savedRoadmapNodeId() {
  try {
    return window.localStorage.getItem(ROADMAP_CURRENT_NODE_KEY) || "";
  } catch {
    return "";
  }
}

function saveRoadmapNodeId(nodeId) {
  try {
    window.localStorage.setItem(ROADMAP_CURRENT_NODE_KEY, nodeId);
  } catch {
    // 禁用本地存储时仍允许正常浏览，继续学习位置只在本次页面中生效。
  }
}

function applyRoadmapCurrentNode() {
  const root = document.getElementById("roadmap-content");
  const route = root?.querySelector('[data-roadmap-panel="route"]');
  const links = [...(route?.querySelectorAll("[data-roadmap-node-link]") || [])];
  if (!links.length) return;
  const saved = savedRoadmapNodeId();
  const current = links.find(link => link.dataset.nodeId === saved) || links[0];
  const total = Number(route.querySelector(".learning-route-layout")?.dataset.routeTotal) || links.length;
  const position = Number(current.dataset.nodePosition) || 1;
  for (const link of links) {
    const active = link === current;
    link.closest(".learning-node")?.classList.toggle("is-current", active);
    if (active) link.setAttribute("aria-current", "step");
    else link.removeAttribute("aria-current");
    const label = link.querySelector(".learning-node-current");
    if (label) label.hidden = !active;
  }
  const currentPhase = current.closest("[data-learning-phase]");
  route.querySelectorAll("[data-learning-phase]").forEach(phase => { phase.open = phase === currentPhase; });
  const setText = (selector, value) => {
    const element = route.querySelector(selector);
    if (element) element.textContent = value;
  };
  setText("[data-current-node-title]", current.dataset.nodeTitle || "知识主题");
  setText("[data-current-node-meta]", `阶段 ${current.dataset.phaseNumber} · ${current.dataset.phaseTitle} · 第 ${current.dataset.nodeSection} 节`);
  setText("[data-current-phase-title]", `阶段 ${current.dataset.phaseNumber} · ${current.dataset.phaseTitle}`);
  setText("[data-current-position]", `第 ${position} / ${total} 个知识点`);
  setText("[data-current-phase-goal]", current.dataset.phaseGoal || "建立当前阶段的核心算法能力。");
  const resume = route.querySelector("[data-current-node-link]");
  if (resume) resume.href = current.dataset.nodeHref;
  const progress = route.querySelector("[data-current-progress]");
  if (progress) progress.style.width = `${Math.max(2, Math.round(position / total * 100))}%`;
}

function setRoadmapOverviewView(view, updateUrl = false) {
  const root = document.getElementById("roadmap-content");
  if (!root?.querySelector(".roadmap-overview")) return;
  const next = view === "index" ? "index" : "route";
  root.querySelectorAll("[data-roadmap-view]").forEach(button => {
    const active = button.dataset.roadmapView === next;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  root.querySelectorAll("[data-roadmap-panel]").forEach(panel => {
    panel.hidden = panel.dataset.roadmapPanel !== next;
  });
  if (next === "index") filterKnowledge();
  if (next === "route") applyRoadmapCurrentNode();
  if (updateUrl) {
    const url = `${window.location.pathname}${window.location.search}${next === "index" ? "#index" : ""}`;
    window.history.pushState(null, "", url);
  }
}

export function syncRoadmapOverviewView() {
  setRoadmapOverviewView(window.location.hash === "#index" ? "index" : "route");
}

function filterKnowledge() {
  const root = document.getElementById("roadmap-content");
  const needle = root.querySelector("#knowledge-search")?.value.trim().toLowerCase() || "";
  const category = root.querySelector("[data-knowledge-category].active")?.dataset.knowledgeCategory || "all";
  const sort = root.querySelector("#knowledge-sort")?.value || "name";
  const cards = [...root.querySelectorAll(".knowledge-topic-card")];
  cards.sort((a,b) => (sort === "count" ? Number(b.dataset.count) - Number(a.dataset.count) : 0) || a.dataset.title.localeCompare(b.dataset.title, "zh-CN"));
  let count = 0;
  for (const card of cards) {
    card.hidden = !(category === "all" || card.dataset.categories.split(" ").includes(category)) || !card.dataset.topic.toLowerCase().includes(needle);
    if (!card.hidden) count++;
    card.parentElement.append(card);
  }
  root.querySelector("#knowledge-results").textContent = `共 ${count} 个知识主题`;
  root.querySelector("#knowledge-empty").hidden = count !== 0;
}

function filterNodeProblems() {
  const root = document.getElementById("node-problems");
  const needle = root.querySelector("#node-search").value.trim().toLowerCase();
  const difficulty = root.querySelector("#node-difficulty").value;
  const source = root.querySelector("#node-source")?.value || "all";
  const sort = root.querySelector("#node-sort").value;
  const cards = [...root.querySelectorAll(".roadmap-problem-card")];
  cards.forEach((card,index) => { card.dataset.originalOrder ??= String(index); });
  cards.sort((a,b) => sort === "records" ? Number(b.dataset.recordCount) - Number(a.dataset.recordCount) || Number(a.dataset.originalOrder) - Number(b.dataset.originalOrder) : sort === "name" ? a.dataset.problemName.localeCompare(b.dataset.problemName, "zh-CN", {numeric:true}) : Number(a.dataset.originalOrder) - Number(b.dataset.originalOrder));
  let count = 0;
  for (const card of cards) {
    card.hidden = (difficulty !== "all" && card.dataset.problemDifficulty !== difficulty)
      || (source !== "all" && card.dataset.problemSource !== source)
      || !card.dataset.problemName.toLowerCase().includes(needle);
    if (!card.hidden) count++;
    card.parentElement.append(card);
  }
  root.querySelector("#node-result-count").textContent = `共 ${count} 道题目`;
  root.querySelector("#node-empty").hidden = count !== 0;
}

export function initDetailInteractions() {
  document.addEventListener("keydown", event => {
    const menu = document.querySelector(".problem-export-menu[open]");
    if (event.key === "Escape" && menu) {
      menu.open = false;
      menu.querySelector("summary").focus();
    }
  });
  document.addEventListener("input", event => {
    if (event.target.id === "tag-search") filterTagIndex();
    if (event.target.id === "knowledge-search") filterKnowledge();
    if (event.target.id === "node-search") filterNodeProblems();
  });
  document.addEventListener("change", event => {
    if (event.target.id === "knowledge-sort") filterKnowledge();
    if (["node-sort", "node-difficulty", "node-source"].includes(event.target.id)) filterNodeProblems();
  });
  document.addEventListener("click", async event => {
    const exportMenu = document.querySelector(".problem-export-menu[open]");
    if (exportMenu && (!exportMenu.contains(event.target) || event.target.closest(".problem-export-options button"))) {
      exportMenu.open = false;
      if (exportMenu.contains(event.target)) exportMenu.querySelector("summary").focus();
    }
    const roadmapView = event.target.closest("[data-roadmap-view]");
    if (roadmapView) {
      setRoadmapOverviewView(roadmapView.dataset.roadmapView, true);
    }
    const roadmapNode = event.target.closest("[data-roadmap-node-link]");
    if (roadmapNode?.dataset.nodeId) saveRoadmapNodeId(roadmapNode.dataset.nodeId);
    const tagCategory = event.target.closest("[data-tag-category]");
    if (tagCategory) {
      document.querySelectorAll("[data-tag-category]").forEach(button => {
        button.classList.toggle("active", button === tagCategory);
        button.setAttribute("aria-pressed", String(button === tagCategory));
      });
      filterTagIndex();
    }
    const category = event.target.closest("[data-knowledge-category]");
    if (category) {
      document.querySelectorAll("[data-knowledge-category]").forEach(button => {
        button.classList.toggle("active", button === category);
        button.setAttribute("aria-pressed", String(button === category));
      });
      filterKnowledge();
    }
    const tab = event.target.closest("[data-tag-section]");
    if (tab) {
      document.querySelectorAll("[data-tag-section]").forEach(button => {
        button.classList.toggle("active", button === tab);
        button.setAttribute("aria-pressed", String(button === tab));
      });
      document.querySelectorAll("[data-tag-panel]").forEach(panel => { panel.hidden = tab.dataset.tagSection !== "all" && panel.dataset.tagPanel !== tab.dataset.tagSection; });
    }
    const anchor = event.target.closest('a[href^="#"]');
    if (anchor?.hash) {
      const target = document.getElementById(anchor.hash.slice(1));
      if (target?.hasAttribute("data-tag-panel")) {
        document.querySelector('[data-tag-section="all"]')?.click();
      }
      if (anchor.closest(".detail-tabs")) anchor.closest(".detail-tabs").querySelectorAll("a").forEach(link => link.classList.toggle("active", link === anchor));
    }
    const copy = event.target.closest("[data-copy-code]");
    if (copy) {
      const panel = copy.closest("section");
      try {
        await navigator.clipboard.writeText(panel.querySelector("code").textContent);
        panel.querySelector(".copy-feedback").textContent = "代码已复制。";
      } catch {
        panel.querySelector(".copy-feedback").textContent = "复制失败，请选中代码手动复制。";
      }
    }
    const share = event.target.closest("[data-share-page]");
    if (share) {
      const feedback = share.parentElement.querySelector(".share-feedback");
      try {
        await navigator.clipboard.writeText(window.location.href);
        feedback.textContent = "页面链接已复制。";
      } catch {
        feedback.textContent = "请复制浏览器地址栏中的链接分享。";
      }
    }
  });
  syncRoadmapOverviewView();
}
