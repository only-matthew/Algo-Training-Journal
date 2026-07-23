(async function bootstrap() {
  let journal;
  try {
    const response = await fetch("data.json");
    journal = await response.json();
  } catch (error) {
    document.getElementById("records").textContent = "数据加载失败，请稍后刷新重试。";
    return;
  }

  const { members, logs, heatmap, recent30 } = journal;
  const memberSelect = document.getElementById("member-select");

  for (const member of members) {
    const option = document.createElement("option");
    option.value = member;
    option.textContent = member;
    memberSelect.appendChild(option);
  }

  function toDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function levelOf(count) {
    if (!count) return 0;
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count <= 4) return 3;
    return 4;
  }

  function renderStats(member) {
    const stats = recent30.byMember[member];
    document.getElementById("metric-total").textContent = String(stats.totalLogs);
    document.getElementById("metric-days").textContent = String(stats.activeDays);
    document.getElementById("metric-weekly").textContent = `${stats.avgPerWeek} 题/周`;

    const platformRoot = document.getElementById("platform-stats");
    const difficultyRoot = document.getElementById("difficulty-stats");
    platformRoot.innerHTML = "";
    difficultyRoot.innerHTML = "";

    function renderMap(root, map, emptyText) {
      const entries = Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
      if (!entries.length) {
        root.textContent = emptyText;
        return;
      }
      const list = document.createElement("ul");
      list.className = "stat-list";
      for (const [name, count] of entries) {
        const item = document.createElement("li");
        item.innerHTML = `<span>${name}</span><strong>${count}</strong>`;
        list.appendChild(item);
      }
      root.appendChild(list);
    }

    renderMap(platformRoot, stats.byPlatform, "近 30 天暂无来源数据。");
    renderMap(difficultyRoot, stats.byDifficulty, "近 30 天暂无难度数据。");
  }

  function renderHeatmap(member) {
    const counts = member === "all" ? heatmap.all : (heatmap.byMember[member] || {});
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 364);

    const heatmapRoot = document.getElementById("heatmap");
    heatmapRoot.innerHTML = "";

    for (let i = 0; i < 365; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const dateText = toDateString(date);
      const count = counts[dateText] || 0;

      let tooltip = `${dateText} · ${count} 题`;
      if (member === "all" && count > 0) {
        const contributions = members
          .map((m) => ({
            name: m,
            cnt: (heatmap.byMember[m] && heatmap.byMember[m][dateText]) || 0,
          }))
          .filter((c) => c.cnt > 0)
          .sort((a, b) => b.cnt - a.cnt || a.name.localeCompare(b.name, "zh-CN"));
        const lines = contributions.map((c) => `${c.name}: ${c.cnt} 题`);
        tooltip = [tooltip, ...lines].join("\n");
      }

      const cell = document.createElement("span");
      cell.className = `cell lv${levelOf(count)}`;
      cell.title = tooltip;
      heatmapRoot.appendChild(cell);
    }
  }

  function renderLogs(member) {
    const filtered = member === "all" ? logs : logs.filter((log) => log.member === member);
    document.getElementById("record-count").textContent = `${recent30.start} ~ ${recent30.end} 统计窗口，当前筛选共 ${filtered.length} 条记录`;

    const recordsRoot = document.getElementById("records");
    recordsRoot.innerHTML = "";

    if (!filtered.length) {
      recordsRoot.textContent = "暂无记录。";
      return;
    }

    for (const log of filtered) {
      const card = document.createElement("article");
      card.className = "record";
      card.innerHTML = `
        <div class="record-head">
          <time>${log.date}</time>
          <span>${log.member}</span>
        </div>
        <h3>${log.problem}</h3>
        <p class="meta">平台：${log.platform} ｜ 难度：${log.difficulty}</p>
        <p>${log.takeaway}</p>
      `;
      recordsRoot.appendChild(card);
    }
  }

  function render(member) {
    renderStats(member);
    renderHeatmap(member);
    renderLogs(member);
  }

  memberSelect.addEventListener("change", () => render(memberSelect.value));
  render("all");
})();
