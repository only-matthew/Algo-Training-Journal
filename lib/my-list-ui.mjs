import { currentUser } from "./auth.mjs";
import { ensureMemberJournal } from "./data.mjs";
import { apiRequest } from "./journal-api.js";
import { personalListProgress, validatePersonalList } from "./personal-list.mjs";

let current = null;
let records = [];
let bound = false;

function status(message) { document.getElementById("my-list-status").textContent = message; }

function paint() {
  const progress = personalListProgress(current.items, records);
  document.getElementById("my-list-progress").textContent = `${progress.completed} / ${progress.total}`;
  const list = document.getElementById("my-list-items");
  list.replaceChildren();
  for (const [index, item] of progress.entries.entries()) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    const title = `${item.platform} ${item.problemNumber}${item.name ? ` · ${item.name}` : ""}`;
    if (item.evidence) {
      const link = document.createElement("a");
      link.href = `/problem/${encodeURIComponent(item.evidence.member)}/${encodeURIComponent(item.evidence.date)}/${encodeURIComponent(item.evidence.problemId || item.evidence.problemIndex || 0)}/`;
      link.textContent = `${title} · 已完成 ${item.evidence.date}`;
      label.append(link);
    } else label.textContent = `${title} · 暂无完成证据`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-outline btn-sm";
    remove.textContent = "移除";
    remove.dataset.index = String(index);
    li.append(label, remove);
    list.append(li);
  }
}

async function save(items) {
  const next = validatePersonalList(items);
  status("正在保存清单...");
  try {
    current = await apiRequest("/api/my-list", { method: "PUT", body: JSON.stringify({ items: next, expectedRevision: current.revision }) });
    paint();
    status("清单已保存。完成证据会随训练记录发布更新。");
    return true;
  } catch (error) {
    status(error.status === 409 ? "清单已在别处修改，请刷新后重试。" : `保存失败：${error.message}`);
    return false;
  }
}

function bind() {
  if (bound) return;
  bound = true;
  document.getElementById("my-list-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!current) return;
    const item = {
      platform: document.getElementById("my-list-platform").value,
      problemNumber: document.getElementById("my-list-number").value,
      name: document.getElementById("my-list-name").value,
    };
    try {
      if (await save([...current.items, item])) {
        document.getElementById("my-list-number").value = "";
        document.getElementById("my-list-name").value = "";
      }
    } catch (error) { status(error.message); }
  });
  document.getElementById("my-list-items").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-index]");
    if (!button || !current) return;
    await save(current.items.filter((_, index) => index !== Number(button.dataset.index)));
  });
}

export async function renderMyList() {
  const panel = document.getElementById("my-list-panel");
  if (!panel) return;
  if (!currentUser) { panel.hidden = true; current = null; return; }
  panel.hidden = false;
  bind();
  status("正在读取个人清单...");
  try {
    const [list, journal] = await Promise.all([
      apiRequest("/api/my-list"),
      ensureMemberJournal(currentUser.member),
    ]);
    current = list;
    records = journal.logs || [];
    paint();
    status("");
  } catch (error) { status(`清单加载失败：${error.message}`); }
}
