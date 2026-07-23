// ============================================================
// OAuth & Auth Module
// ============================================================

const GITHUB_CLIENT_ID = "Ov23liLqB5pUo1d8Pj02";
const OAUTH_WORKER_URL = "https://algo-oauth.xialiao.org";
const GITHUB_REPO_OWNER = "only-matthew";
const GITHUB_REPO = "Algo-Training-Journal";
const GITHUB_BRANCH = "main";

const TOKEN_KEY = "gh_token";
const USER_KEY = "gh_user";

// GitHub 用户名 → 训练日志目录名（真实姓名）的映射
const MEMBER_MAP = {
  "only-matthew": "廖夏",
  // 新队员映射在这里添加："GitHub用户名": "真实姓名"
};

function getMemberName(githubLogin) {
  return MEMBER_MAP[githubLogin] || githubLogin;
}

function loadToken() {
  const hash = window.location.hash;
  if (hash.startsWith("#token=")) {
    const token = hash.slice("#token=".length);
    localStorage.setItem(TOKEN_KEY, token);
    history.replaceState(null, "", window.location.pathname);
  }
  return localStorage.getItem(TOKEN_KEY) || null;
}

function saveUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function loadUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

async function fetchUser(token) {
  const resp = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error("token expired");
  return resp.json();
}

function login() {
  const redirect = encodeURIComponent(window.location.href);
  window.location.href =
    `https://github.com/login/oauth/authorize` +
    `?client_id=${GITHUB_CLIENT_ID}` +
    `&scope=public_repo` +
    `&redirect_uri=${encodeURIComponent(OAUTH_WORKER_URL)}` +
    `&state=${redirect}`;
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  updateAuthUI(null);
}

function updateAuthUI(user) {
  const statusEl = document.getElementById("auth-status");
  const btnLogin = document.getElementById("btn-login");
  const btnLogout = document.getElementById("btn-logout");
  const btnSubmit = document.getElementById("btn-submit");

  if (user) {
    statusEl.innerHTML = `<img src="${user.avatar_url}" class="avatar" width="28" height="28" alt="" /> ${user.login}`;
    btnLogin.style.display = "none";
    btnLogout.style.display = "";
    btnSubmit.style.display = "";
  } else {
    statusEl.textContent = "未登录";
    btnLogin.style.display = "";
    btnLogout.style.display = "none";
    btnSubmit.style.display = "none";
  }
}

// ============================================================
// GitHub API helpers
// ============================================================

async function getFileSha(path, token) {
  const resp = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`GitHub API: ${resp.status}`);
  const data = await resp.json();
  return data.sha;
}

async function getFileContent(path, token) {
  const resp = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`GitHub API: ${resp.status}`);
  const data = await resp.json();
  return decodeURIComponent(escape(atob(data.content)));
}

function parseMarkdownToProblems(markdown) {
  const blocks = markdown.split(/\r?\n---+\r?\n/);
  return blocks.map((block) => {
    const lines = block.split(/\r?\n/);
    const sections = {};
    let currentKey = null;
    let buffer = [];

    for (const line of lines) {
      const headingMatch = line.match(/^##\s+(.+)\s*$/);
      if (headingMatch) {
        if (currentKey) sections[currentKey] = buffer.join("\n").trim();
        currentKey = headingMatch[1].trim();
        buffer = [];
        continue;
      }
      if (currentKey) buffer.push(line);
    }
    if (currentKey) sections[currentKey] = buffer.join("\n").trim();

    return {
      problem: sections["题目"] || "",
      platform: sections["平台"] || "洛谷",
      difficulty: sections["难度"] || "未标注",
      takeaway: sections["收获"] || "",
    };
  });
}

function populateProblems(parsed) {
  const list = document.getElementById("problem-list");
  list.innerHTML = "";
  if (!parsed.length) {
    list.appendChild(createProblemRow(0));
    return;
  }
  parsed.forEach((p, i) => {
    const row = createProblemRow(i);
    row.querySelector(".problem-name").value = p.problem || "";
    row.querySelector(".problem-platform").value = p.platform || "洛谷";
    row.querySelector(".problem-difficulty").value = p.difficulty || "未标注";
    row.querySelector(".problem-takeaway").value = p.takeaway || "";
    list.appendChild(row);
  });
}

async function onDateChange() {
  const token = loadToken();
  if (!token || !currentUser) return;

  const date = document.getElementById("submit-date").value;
  if (!date) return;

  const mappedPath = `logs/${getMemberName(currentUser.login)}/${date}.md`;
  const githubPath = `logs/${currentUser.login}/${date}.md`;

  const btnSave = document.getElementById("btn-save");
  const msgEl = document.getElementById("submit-msg");

  try {
    // 先查映射名路径，再查 GitHub 用户名路径
    let content = await getFileContent(mappedPath, token);
    if (!content) {
      content = await getFileContent(githubPath, token);
    }
    if (content) {
      const parsed = parseMarkdownToProblems(content);
      populateProblems(parsed);
      btnSave.textContent = "更新记录";
      msgEl.textContent = "📝 加载已有记录，修改后点击「更新记录」即可覆盖";
    } else {
      resetProblems();
      btnSave.textContent = "提交到 GitHub";
      msgEl.textContent = "";
    }
  } catch {
    resetProblems();
    btnSave.textContent = "提交到 GitHub";
    msgEl.textContent = "";
  }
}

async function commitFile(path, content, message, token, sha) {
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch: GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;
  const resp = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.message || `GitHub API: ${resp.status}`);
  }
  return resp.json();
}

async function ensureMemberDir(member, date, token) {
  // 确保 logs/队员名/.gitkeep 存在（创建目录）
  const gitkeepPath = `logs/${member}/.gitkeep`;
  const sha = await getFileSha(gitkeepPath, token);
  if (!sha) {
    await commitFile(gitkeepPath, "", `chore: create directory for ${member}`, token, null);
  }
}

// ============================================================
// Submit Modal
// ============================================================

let currentUser = null;

function openModal() {
  document.getElementById("submit-modal").style.display = "flex";
  document.getElementById("submit-date").value = toDateString(new Date());
  document.getElementById("submit-msg").textContent = "";
  resetProblems();
}

function closeModal() {
  document.getElementById("submit-modal").style.display = "none";
}

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function createProblemRow(index) {
  const div = document.createElement("div");
  div.className = "problem-block";
  div.dataset.index = index;
  div.innerHTML = `
    <div class="problem-header">
      <span>第 ${index + 1} 题</span>
      ${index > 0 ? `<button type="button" class="btn-icon btn-remove" data-idx="${index}">&times;</button>` : ""}
    </div>
    <div class="form-group">
      <label>题目名称</label>
      <input type="text" class="form-input problem-name" placeholder="如 P1104 或 CF 4A" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>平台</label>
        <select class="form-input problem-platform">
          <option value="洛谷">洛谷</option>
          <option value="Codeforces">Codeforces</option>
          <option value="AtCoder">AtCoder</option>
          <option value="其他">其他</option>
        </select>
      </div>
      <div class="form-group">
        <label>难度</label>
        <select class="form-input problem-difficulty">
          <option value="未标注">未标注</option>
          <option value="入门">入门</option>
          <option value="普及-">普及-</option>
          <option value="普及/提高-">普及/提高-</option>
          <option value="提高+/省选-">提高+/省选-</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>收获 / 题解</label>
      <textarea class="form-input problem-takeaway" rows="4" placeholder="今天学到的内容、踩的坑，或题解..."></textarea>
    </div>
  `;
  return div;
}

function resetProblems() {
  const list = document.getElementById("problem-list");
  list.innerHTML = "";
  list.appendChild(createProblemRow(0));
}

function addProblem() {
  const list = document.getElementById("problem-list");
  const idx = list.children.length;
  list.appendChild(createProblemRow(idx));
}

function collectProblems() {
  const blocks = document.querySelectorAll(".problem-block");
  const problems = [];
  for (const block of blocks) {
    const name = block.querySelector(".problem-name").value.trim();
    if (!name) continue;
    problems.push({
      problem: name,
      platform: block.querySelector(".problem-platform").value,
      difficulty: block.querySelector(".problem-difficulty").value,
      takeaway: block.querySelector(".problem-takeaway").value.trim(),
    });
  }
  return problems;
}

function buildMarkdown(date, problems) {
  const blocks = problems.map((p) => {
    return [
      `## 题目`,
      ``,
      `${p.problem}`,
      ``,
      `## 平台`,
      ``,
      `${p.platform}`,
      ``,
      `## 难度`,
      ``,
      `${p.difficulty}`,
      ``,
      `## 收获`,
      ``,
      `${p.takeaway || "未填写"}`,
    ].join("\n");
  });
  return [`# ${date}`, "", blocks.join("\n\n---\n\n"), ""].join("\n");
}

async function handleSubmit() {
  const token = loadToken();
  if (!token) {
    alert("请先登录 GitHub");
    return;
  }

  const date = document.getElementById("submit-date").value;
  if (!date) {
    document.getElementById("submit-msg").textContent = "请选择日期";
    return;
  }

  const problems = collectProblems();
  if (!problems.length) {
    document.getElementById("submit-msg").textContent = "请至少填写一道题";
    return;
  }

  const msgEl = document.getElementById("submit-msg");
  msgEl.textContent = "提交中...";
  const btnSave = document.getElementById("btn-save");
  btnSave.disabled = true;

  try {
    const member = getMemberName(currentUser.login);
    const filename = `${date}.md`;
    const mappedPath = `logs/${member}/${filename}`;
    const githubPath = `logs/${currentUser.login}/${filename}`;

    // 确定实际存在的文件路径和 SHA（同时查两个目录）
    let sha = await getFileSha(mappedPath, token);
    let actualPath = mappedPath;
    if (!sha) {
      sha = await getFileSha(githubPath, token);
      if (sha) actualPath = githubPath;
    }
    const isEdit = !!sha;
    const markdown = buildMarkdown(date, problems);
    const commitMsg = isEdit
      ? `feat(${member}): update training log for ${date}`
      : `feat(${member}): add training log for ${date}`;

    await ensureMemberDir(member, date, token);
    await commitFile(actualPath, markdown, commitMsg, token, sha);

    msgEl.textContent = isEdit
      ? "✅ 更新成功！等待自动部署（约 1 分钟）"
      : "✅ 提交成功！等待自动部署（约 1 分钟）";
    setTimeout(closeModal, 2000);
  } catch (err) {
    msgEl.textContent = `❌ 提交失败：${err.message}`;
  } finally {
    btnSave.disabled = false;
  }
}

// ============================================================
// Journal Rendering (original logic, kept intact)
// ============================================================

function renderJournal(journal) {
  const { members, logs, heatmap, recent30 } = journal;

  function levelOf(count) {
    if (!count) return 0;
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count <= 4) return 3;
    return 4;
  }

  function renderStats(member) {
    const stats = recent30.byMember[member];
    if (!stats) return;
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
      const takeawayHtml = log.takeaway ? renderMarkdown(log.takeaway) : "未填写";

      card.innerHTML = `
        <div class="record-head">
          <time>${log.date}</time>
          <span>${log.member}</span>
        </div>
        <h3 class="record-title-clickable" onclick="this.closest('.record').classList.toggle('expanded')">${log.problem} <span class="expand-icon">▼</span></h3>
        <p class="meta">平台：${log.platform} ｜ 难度：${log.difficulty}</p>
        <div class="record-takeaway">${takeawayHtml}</div>
      `;
      recordsRoot.appendChild(card);
    }
  }

  // 轻量级 Markdown 渲染器（支持代码块和行内代码）
  function renderMarkdown(text) {
    if (!text) return "";
    let html = escapeHtml(text);

    // 代码块 ```...```
    html = html.replace(/```(\w*)\s*\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
    });

    // 行内代码 `...`
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // 换行转为 <br>
    html = html.replace(/\n/g, "<br>");

    return html;
  }

  function escapeHtml(str) {
    const el = document.createElement("div");
    el.appendChild(document.createTextNode(str));
    return el.innerHTML;
  }

  // 动态填充队员下拉框
  const memberSelect = document.getElementById("member-select");
  // 保留「全队」选项，清空其他
  while (memberSelect.options.length > 1) memberSelect.remove(1);
  const uniqueMembers = [...new Set(members)];
  for (const member of uniqueMembers) {
    const option = document.createElement("option");
    option.value = member;
    option.textContent = member;
    memberSelect.appendChild(option);
  }

  function render(member) {
    renderStats(member);
    renderHeatmap(member);
    renderLogs(member);
  }

  render("all");
  memberSelect.addEventListener("change", (e) => render(e.target.value));
}

// ============================================================
// Bootstrap
// ============================================================

(async function bootstrap() {
  // 1. Auth
  const token = loadToken();
  if (token) {
    try {
      const user = await fetchUser(token);
      saveUser(user);
      currentUser = user;
      updateAuthUI(user);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      updateAuthUI(null);
    }
  } else {
    updateAuthUI(null);
  }

  // 2. Event bindings
  document.getElementById("btn-login").addEventListener("click", login);
  document.getElementById("btn-logout").addEventListener("click", logout);
  document.getElementById("btn-submit").addEventListener("click", openModal);
  document.getElementById("btn-close-modal").addEventListener("click", closeModal);
  document.getElementById("submit-modal").addEventListener("click", (e) => {
    if (e.target.id === "submit-modal") closeModal();
  });
  document.getElementById("btn-add-problem").addEventListener("click", addProblem);
  document.getElementById("btn-save").addEventListener("click", handleSubmit);
  document.getElementById("submit-date").addEventListener("change", onDateChange);
  document.getElementById("problem-list").addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-remove")) {
      e.target.closest(".problem-block").remove();
    }
  });

  // 3. Load journal
  try {
    const response = await fetch("data.json");
    const journal = await response.json();
    renderJournal(journal);
  } catch {
    document.getElementById("records").textContent = "数据加载失败，请稍后刷新重试。";
  }
})();