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
  "wzzzzhhhhh": "王梓豪",
  "seanist-isx": "郭一鸣",
  // 新队员映射在这里添加："GitHub用户名": nd"真实姓名"
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
    `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO}/contents/${encodeURI(path)}?ref=${GITHUB_BRANCH}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`GitHub API: ${resp.status}`);
  const data = await resp.json();
  return data.sha;
}

async function getFileContent(path, token) {
  const resp = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO}/contents/${encodeURI(path)}?ref=${GITHUB_BRANCH}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`GitHub API: ${resp.status}`);
  const data = await resp.json();
  return decodeURIComponent(escape(atob(data.content)));
}

async function deleteFile(path, message, token, sha) {
  const resp = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO}/contents/${encodeURI(path)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        sha,
        branch: GITHUB_BRANCH,
      }),
    },
  );
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.message || `GitHub API: ${resp.status}`);
  }
  return resp.json();
}

async function commitTreeChanges(changes, message, token) {
  const apiBase = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const refResp = await fetch(`${apiBase}/git/ref/heads/${GITHUB_BRANCH}`, { headers });
  if (!refResp.ok) throw new Error(`GitHub API: ${refResp.status}`);
  const ref = await refResp.json();

  const commitResp = await fetch(`${apiBase}/git/commits/${ref.object.sha}`, { headers });
  if (!commitResp.ok) throw new Error(`GitHub API: ${commitResp.status}`);
  const parentCommit = await commitResp.json();

  const tree = await Promise.all(changes.map(async (change) => {
    if (change.delete) {
      return { path: change.path, mode: "100644", type: "blob", sha: null };
    }

    const blobResp = await fetch(`${apiBase}/git/blobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        content: btoa(unescape(encodeURIComponent(change.content))),
        encoding: "base64",
      }),
    });
    if (!blobResp.ok) throw new Error(`GitHub API: ${blobResp.status}`);
    const blob = await blobResp.json();
    return { path: change.path, mode: "100644", type: "blob", sha: blob.sha };
  }));

  const treeResp = await fetch(`${apiBase}/git/trees`, {
    method: "POST",
    headers,
    body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree }),
  });
  if (!treeResp.ok) throw new Error(`GitHub API: ${treeResp.status}`);
  const newTree = await treeResp.json();

  const newCommitResp = await fetch(`${apiBase}/git/commits`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message, tree: newTree.sha, parents: [ref.object.sha] }),
  });
  if (!newCommitResp.ok) throw new Error(`GitHub API: ${newCommitResp.status}`);
  const newCommit = await newCommitResp.json();

  const updateRefResp = await fetch(`${apiBase}/git/refs/heads/${GITHUB_BRANCH}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ sha: newCommit.sha, force: false }),
  });
  if (!updateRefResp.ok) throw new Error(`GitHub API: ${updateRefResp.status}`);
}

// ============================================================
// Logs — new multi-file storage: meta.json + N-{desc,takeaway,solution}
// ============================================================

function metaFromProblems(problems) {
  return {
    problems: problems.map((p) => ({
      name: p.problem,
      platform: p.platform,
      difficulty: p.difficulty,
    })),
  };
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
  onDateChange();
}

function closeModal(force = false) {
  if (!force) {
    const problems = collectProblems();
    const hasContent = problems.length > 0;
    if (!hasContent) {
      const blocks = document.querySelectorAll(".problem-block");
      for (const block of blocks) {
        const takeaway = block.querySelector(".problem-takeaway")?.value?.trim();
        const code = block.querySelector(".problem-code")?.value?.trim();
        const desc = block.querySelector(".problem-description")?.value?.trim();
        if (takeaway || code || desc) {
          if (confirm("表单中有未保存的数据，确定要关闭吗？")) {
            break;
          } else {
            return;
          }
        }
      }
    } else {
      if (!confirm("表单中有未保存的数据，确定要关闭吗？")) {
        return;
      }
    }
  }
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
          <optgroup label="洛谷难度分级">
            <option value="未标注">未标注</option>
            <option value="入门">入门</option>
            <option value="普及-">普及-</option>
            <option value="普及/提高-">普及/提高-</option>
            <option value="提高+/省选-">提高+/省选-</option>
          </optgroup>
          <optgroup label="Codeforces Rating 范围">
            <option value="≤1199">≤1199</option>
            <option value="1200-1399">1200-1399</option>
            <option value="1400-1599">1400-1599</option>
            <option value="1600-1899">1600-1899</option>
            <option value="1900-2199">1900-2199</option>
            <option value="≥2200">≥2200</option>
          </optgroup>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>题目描述（选填）</label>
      <textarea class="form-input problem-description" rows="2" placeholder="简要描述题目大意..."></textarea>
    </div>
    <div class="form-group">
      <label>收获 / 题解</label>
      <textarea class="form-input problem-takeaway" rows="4" placeholder="今天学到的内容、踩的坑，或题解..."></textarea>
    </div>
    <div class="form-group">
      <label>代码（选填，直接粘贴）</label>
      <textarea class="form-input problem-code" rows="6" placeholder="粘贴代码即可，自动高亮显示" spellcheck="false"></textarea>
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
      description: block.querySelector(".problem-description").value.trim(),
      takeaway: block.querySelector(".problem-takeaway").value.trim(),
      code: block.querySelector(".problem-code").value.trim(),
    });
  }
  return problems;
}

async function onDateChange() {
  const token = loadToken();
  if (!token || !currentUser) return;

  const date = document.getElementById("submit-date").value;
  if (!date) return;

  const member = getMemberName(currentUser.login);
  const baseDir = `logs/${member}/${date}`;
  const githubBaseDir = `logs/${currentUser.login}/${date}`;

  const btnSave = document.getElementById("btn-save");
  const msgEl = document.getElementById("submit-msg");

  try {
    // Try to read meta.json
    let metaPath = `${baseDir}/meta.json`;
    let metaContent = await getFileContent(metaPath, token);
    let actualBaseDir = baseDir;
    if (!metaContent) {
      metaPath = `${githubBaseDir}/meta.json`;
      metaContent = await getFileContent(metaPath, token);
      if (metaContent) actualBaseDir = githubBaseDir;
    }

    const btnDelete = document.getElementById("btn-delete");
    if (metaContent) {
      const meta = JSON.parse(metaContent);
      const problems = [];
      // Read each problem's individual files
      for (let i = 0; i < meta.problems.length; i++) {
        const p = meta.problems[i];
        const desc = await getFileContent(`${actualBaseDir}/${i}-desc.md`, token);
        const takeaway = await getFileContent(`${actualBaseDir}/${i}-takeaway.md`, token);
        const code = await getFileContent(`${actualBaseDir}/${i}-solution.cpp`, token);
        problems.push({
          problem: p.name || "",
          platform: p.platform || "洛谷",
          difficulty: p.difficulty || "未标注",
          description: desc || "",
          takeaway: takeaway || "",
          code: code || "",
        });
      }
      populateProblems(problems);
      btnSave.textContent = "更新记录";
      msgEl.textContent = "📝 加载已有记录，修改后点击「更新记录」即可覆盖";
      btnDelete.style.display = "";
      btnDelete.onclick = () => handleDelete(date);
    } else {
      resetProblems();
      btnSave.textContent = "提交到 GitHub";
      msgEl.textContent = "";
      btnDelete.style.display = "none";
    }
  } catch {
    resetProblems();
    btnSave.textContent = "提交到 GitHub";
    msgEl.textContent = "";
  }
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
    row.querySelector(".problem-description").value = p.description || "";
    row.querySelector(".problem-takeaway").value = p.takeaway || "";
    row.querySelector(".problem-code").value = p.code || "";
    list.appendChild(row);
  });
}

async function handleDelete(date) {
  const token = loadToken();
  if (!token || !currentUser) {
    alert("请先登录 GitHub");
    return;
  }
  if (!confirm(`确定要删除 ${date} 的训练记录吗？此操作不可撤销。`)) return;

  const member = getMemberName(currentUser.login);
  const memberDir = `logs/${member}/${date}`;
  const githubDir = `logs/${currentUser.login}/${date}`;

  const msgEl = document.getElementById("submit-msg");
  msgEl.textContent = "删除中...";
  const btnDelete = document.getElementById("btn-delete");
  if (btnDelete) btnDelete.disabled = true;

  try {
    // Find which base dir has the meta.json
    let metaSha = await getFileSha(`${memberDir}/meta.json`, token);
    let baseDir = memberDir;
    if (!metaSha) {
      metaSha = await getFileSha(`${githubDir}/meta.json`, token);
      if (metaSha) baseDir = githubDir;
    }
    if (!metaSha) {
      // Also try old single .md format
      const oldSha = await getFileSha(`logs/${currentUser.login}/${date}.md`, token)
        || await getFileSha(`${memberDir.replace(/\/[^/]+$/, '')}/${date}.md`, token);
      if (oldSha) {
        await deleteFile(
          `logs/${currentUser.login}/${date}.md`,
          `delete(${member}): remove training log for ${date}`,
          token, oldSha
        );
        msgEl.textContent = "✅ 删除成功！等待自动部署（约 1 分钟）";
        setTimeout(() => closeModal(true), 2000);
        return;
      }
      msgEl.textContent = "❌ 未找到该记录";
      return;
    }

    // Read meta to know how many problems exist
    const metaContent = await getFileContent(`${baseDir}/meta.json`, token);
    const meta = JSON.parse(metaContent);
    const problemCount = meta.problems.length;

    // Collect all files to delete
    const filesToDelete = [{ path: `${baseDir}/meta.json`, sha: metaSha }];
    for (let i = 0; i < problemCount; i++) {
      const descSha = await getFileSha(`${baseDir}/${i}-desc.md`, token);
      if (descSha) filesToDelete.push({ path: `${baseDir}/${i}-desc.md`, sha: descSha });
      const takeawaySha = await getFileSha(`${baseDir}/${i}-takeaway.md`, token);
      if (takeawaySha) filesToDelete.push({ path: `${baseDir}/${i}-takeaway.md`, sha: takeawaySha });
      const codeSha = await getFileSha(`${baseDir}/${i}-solution.cpp`, token);
      if (codeSha) filesToDelete.push({ path: `${baseDir}/${i}-solution.cpp`, sha: codeSha });
    }

    // Delete all files
    for (const f of filesToDelete) {
      await deleteFile(f.path, `delete(${member}): remove training log for ${date}`, token, f.sha);
    }

    msgEl.textContent = "✅ 删除成功！等待自动部署（约 1 分钟）";
    setTimeout(() => closeModal(true), 2000);
  } catch (err) {
    msgEl.textContent = `❌ 删除失败：${err.message}`;
  } finally {
    if (btnDelete) btnDelete.disabled = false;
  }
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
    const baseDir = `logs/${member}/${date}`;
    const memberName = member;

    // Build meta.json
    const meta = metaFromProblems(problems);
    const metaContent = JSON.stringify(meta, null, 2);

    // Check if this is an edit (meta.json already exists)
    let oldCount = 0;
    const oldMetaContent = await getFileContent(`${baseDir}/meta.json`, token);
    const metaSha = await getFileSha(`${baseDir}/meta.json`, token);
    const isEdit = !!metaSha;
    if (isEdit && oldMetaContent) {
      const oldMeta = JSON.parse(oldMetaContent);
      oldCount = oldMeta.problems.length;
    }

    const commitMsg = isEdit
      ? `feat(${memberName}): update training log for ${date}`
      : `feat(${memberName}): add training log for ${date}`;

    const changes = [{ path: `${baseDir}/meta.json`, content: metaContent }];

    for (let i = 0; i < problems.length; i++) {
      const p = problems[i];

      const descSha = await getFileSha(`${baseDir}/${i}-desc.md`, token);
      if (p.description) {
        changes.push({ path: `${baseDir}/${i}-desc.md`, content: p.description });
      } else if (descSha) {
        changes.push({ path: `${baseDir}/${i}-desc.md`, delete: true });
      }

      changes.push({ path: `${baseDir}/${i}-takeaway.md`, content: p.takeaway || "未填写" });

      const codeSha = await getFileSha(`${baseDir}/${i}-solution.cpp`, token);
      if (p.code) {
        changes.push({ path: `${baseDir}/${i}-solution.cpp`, content: p.code });
      } else if (codeSha) {
        changes.push({ path: `${baseDir}/${i}-solution.cpp`, delete: true });
      }
    }

    if (isEdit && problems.length < oldCount) {
      for (let i = problems.length; i < oldCount; i++) {
        const descSha = await getFileSha(`${baseDir}/${i}-desc.md`, token);
        if (descSha) changes.push({ path: `${baseDir}/${i}-desc.md`, delete: true });
        const takeawaySha = await getFileSha(`${baseDir}/${i}-takeaway.md`, token);
        if (takeawaySha) changes.push({ path: `${baseDir}/${i}-takeaway.md`, delete: true });
        const codeSha = await getFileSha(`${baseDir}/${i}-solution.cpp`, token);
        if (codeSha) changes.push({ path: `${baseDir}/${i}-solution.cpp`, delete: true });
      }
    }

    await commitTreeChanges(changes, commitMsg, token);

    msgEl.textContent = isEdit
      ? "✅ 更新成功！等待自动部署（约 1 分钟）"
      : "✅ 提交成功！等待自动部署（约 1 分钟）";
    setTimeout(() => closeModal(true), 2000);
  } catch (err) {
    msgEl.textContent = `❌ 提交失败：${err.message}`;
  } finally {
    btnSave.disabled = false;
  }
}

// ============================================================
// Journal Rendering
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
      const descHtml = log.description ? `<div class="record-desc">${renderMarkdown(log.description)}</div>` : "";
      const codeHtml = log.code
        ? `<pre class="line-numbers"><code class="language-cpp">${escapeHtml(log.code)}</code></pre>`
        : "";

      card.innerHTML = `
        <div class="record-head">
          <time>${log.date}</time>
          <span>${log.member}</span>
        </div>
        <h3 class="record-title-clickable" onclick="this.closest('.record').classList.toggle('expanded')">${log.problem} <span class="expand-icon">▼</span></h3>
        <p class="meta">平台：${log.platform} ｜ 难度：${log.difficulty}</p>
        <div class="record-takeaway">
          ${descHtml}
          ${takeawayHtml}
          ${codeHtml}
        </div>
      `;
      recordsRoot.appendChild(card);
    }

    // Prism 语法高亮
    if (typeof Prism !== "undefined") {
      Prism.highlightAllUnder(recordsRoot);
    }
    // KaTeX 数学公式渲染 ($$...$$ 和 $...$)
    if (typeof renderMathInElement !== "undefined") {
      renderMathInElement(recordsRoot, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    }
  }

  // Markdown 渲染器（支持代码块 + 行内代码 + LaTeX 公式）
  function renderMarkdown(text) {
    if (!text) return "";

    // 将所有"特殊片段"提取为占位符，然后再对剩余纯文本做 escapeHtml，
    // 最后还原。这样特殊片段内部的 < > & " ' 不会被二次转义。
    const preserved = [];

    // 1. 代码块 ```...```
    let processed = text.replace(/```(\w*)\s*\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = preserved.length;
      const languageClass = lang ? `language-${lang}` : "language-text";
      preserved.push(`<pre class="line-numbers"><code class="${languageClass}">${escapeHtml(code.trim())}</code></pre>`);
      return `\x00P${idx}\x00`;
    });

    // 2. 行间公式 $$...$$
    processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => {
      const idx = preserved.length;
      preserved.push(`$$${formula.trim()}$$`);
      return `\x00P${idx}\x00`;
    });

    // 3. 行内公式 $...$（排除 $$）
    processed = processed.replace(/(?<!\$)\$(?!\$)([^$]+?)\$(?!\$)/g, (_, formula) => {
      const idx = preserved.length;
      preserved.push(`$${formula.trim()}$`);
      return `\x00P${idx}\x00`;
    });

    // 4. 行内代码 `...` —— 必须在 escapeHtml 之前提取，否则反引号会被转义成 &#96;
    processed = processed.replace(/`([^`]+)`/g, (_, codeContent) => {
      const idx = preserved.length;
      preserved.push(`<code class="language-text">${escapeHtml(codeContent)}</code>`);
      return `\x00P${idx}\x00`;
    });

    // 5. Markdown 标题。标题内容先转义，避免用户输入被当成 HTML 执行。
    processed = processed.replace(/^ {0,3}(#{1,6})[ \t]+(.+?)\s*#*$/gm, (_, marks, heading) => {
      const idx = preserved.length;
      const level = marks.length;
      preserved.push(`<h${level}>${escapeHtml(heading.trim())}</h${level}>`);
      return `\x00P${idx}\x00`;
    });

    // 6. 对剩余内容 escape HTML
    processed = escapeHtml(processed);

    // 7. 只给普通文本换行，避免把代码块中的换行变成 <br>
    processed = processed.replace(/\n/g, "<br>");

    // 8. 还原所有保留片段
    processed = processed.replace(/\x00P(\d+)\x00/g, (_, idx) => preserved[parseInt(idx)]);

    return processed;
  }

  function escapeHtml(str) {
    const el = document.createElement("div");
    el.appendChild(document.createTextNode(str));
    return el.innerHTML;
  }

  // 动态填充队员下拉框
  const memberSelect = document.getElementById("member-select");
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

  return { render };
}

// ============================================================
// Data Refresh & Cache Busting
// ============================================================

const REFRESH_INTERVAL = 5 * 60 * 1000;
let journalPromise = null;

async function loadJournal() {
  if (journalPromise) {
    return await journalPromise;
  }
  journalPromise = fetch(`data.json?ts=${Date.now()}`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .finally(() => {
      journalPromise = null;
    });
  return await journalPromise;
}

function startRefreshTimer(renderFn, getCurrentMember) {
  // 静默后台刷新，每 5 分钟更新一次数据
  setInterval(async () => {
    await doRefresh(renderFn, getCurrentMember);
  }, REFRESH_INTERVAL);
}

async function doRefresh(renderFn, getCurrentMember) {
  const btnRefresh = document.getElementById("btn-refresh");
  if (btnRefresh) {
    btnRefresh.disabled = true;
    btnRefresh.textContent = "⏳ 刷新中...";
  }

  try {
    const journal = await loadJournal();
    if (journal) {
      const member = getCurrentMember ? getCurrentMember() : "all";
      const result = renderJournal(journal);
      if (result && result.render) {
        result.render(member);
      }
    }
  } catch (err) {
    console.error("刷新失败:", err);
  } finally {
    if (btnRefresh) {
      btnRefresh.disabled = false;
      btnRefresh.textContent = "🔄 刷新";
    }
  }
}

// ============================================================
// Theme Management
// ============================================================

const THEME_KEY = "theme";
const THEME_LIGHT = "light";
const THEME_DARK = "dark";

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? THEME_DARK : THEME_LIGHT;
}

function getTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  return saved || getSystemTheme();
}

function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === THEME_DARK) {
    html.setAttribute("data-theme", THEME_DARK);
  } else {
    html.removeAttribute("data-theme");
  }
  updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById("btn-theme");
  if (!btn) return;
  btn.textContent = theme === THEME_DARK ? "☀️" : "🌙";
  btn.title = theme === THEME_DARK ? "切换为浅色模式" : "切换为暗色模式";
}

function toggleTheme() {
  const current = getTheme();
  const next = current === THEME_DARK ? THEME_LIGHT : THEME_DARK;
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

function initTheme() {
  applyTheme(getTheme());

  // Listen for system theme changes — only take effect when user hasn't manually chosen
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!localStorage.getItem(THEME_KEY)) {
      applyTheme(getSystemTheme());
    }
  });
}

// ============================================================
// Bootstrap
// ============================================================

(async function bootstrap() {
  // 0. Theme
  initTheme();

  // 1. Auth
  const token = loadToken();
  if (token) {
    try {
      const user = await fetchUser(token);
      if (!MEMBER_MAP[user.login]) {
        alert(`抱歉，${user.login} 不在队伍白名单中。\n\n如有需要请联系管理员添加。`);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        updateAuthUI(null);
        return;
      }
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
  document.getElementById("btn-theme").addEventListener("click", toggleTheme);
  document.getElementById("btn-login").addEventListener("click", login);
  document.getElementById("btn-logout").addEventListener("click", logout);
  document.getElementById("btn-submit").addEventListener("click", openModal);
  document.getElementById("btn-close-modal").addEventListener("click", () => closeModal());
  document.getElementById("btn-add-problem").addEventListener("click", addProblem);
  document.getElementById("btn-save").addEventListener("click", handleSubmit);
  document.getElementById("submit-date").addEventListener("change", onDateChange);
  document.getElementById("problem-list").addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-remove")) {
      e.target.closest(".problem-block").remove();
    }
  });

  // 3. Load journal
  let journalRenderer = null;
  try {
    const journal = await loadJournal();
    if (journal) {
      journalRenderer = renderJournal(journal);
    }
  } catch {
    document.getElementById("records").textContent = "数据加载失败，请稍后刷新重试。";
  }

  // 4. Setup refresh timer
  if (journalRenderer) {
    const getCurrentMember = () => {
      const select = document.getElementById("member-select");
      return select ? select.value : "all";
    };
    startRefreshTimer(journalRenderer.render, getCurrentMember);
  }

  // 5. Manual refresh
  document.getElementById("btn-refresh").addEventListener("click", async () => {
    const getCurrentMember = () => {
      const select = document.getElementById("member-select");
      return select ? select.value : "all";
    };
    await doRefresh(journalRenderer ? journalRenderer.render : null, getCurrentMember);
  });
})();