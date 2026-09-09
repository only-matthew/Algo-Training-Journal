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
  const sort = root.querySelector("#node-sort").value;
  const cards = [...root.querySelectorAll(".roadmap-problem-card")];
  cards.forEach((card,index) => { card.dataset.originalOrder ??= String(index); });
  cards.sort((a,b) => sort === "records" ? Number(b.dataset.recordCount) - Number(a.dataset.recordCount) || Number(a.dataset.originalOrder) - Number(b.dataset.originalOrder) : sort === "name" ? a.dataset.problemName.localeCompare(b.dataset.problemName, "zh-CN", {numeric:true}) : Number(a.dataset.originalOrder) - Number(b.dataset.originalOrder));
  let count = 0;
  for (const card of cards) {
    card.hidden = (difficulty !== "all" && card.dataset.problemDifficulty !== difficulty) || !card.dataset.problemName.toLowerCase().includes(needle);
    if (!card.hidden) count++;
    card.parentElement.append(card);
  }
  root.querySelector("#node-result-count").textContent = `共 ${count} 道题目`;
  root.querySelector("#node-empty").hidden = count !== 0;
}

export function initDetailInteractions() {
  document.addEventListener("input", event => {
    if (event.target.id === "knowledge-search") filterKnowledge();
    if (event.target.id === "node-search") filterNodeProblems();
  });
  document.addEventListener("change", event => {
    if (event.target.id === "knowledge-sort") filterKnowledge();
    if (["node-sort", "node-difficulty"].includes(event.target.id)) filterNodeProblems();
  });
  document.addEventListener("click", async event => {
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
}
