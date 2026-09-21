import { initTheme, toggleTheme } from "./lib/theme.mjs";
import { currentUser, initSession, login, logout } from "./lib/auth.mjs";
import { initDetailInteractions } from "./lib/detail-interactions.mjs";
import { loadProblemDetail } from "./lib/data.mjs";
import { icon } from "./lib/icons.mjs";
import {
  exportToLatex,
  exportToMD,
  exportToPDF,
  quickReviewAction,
  renderEnhancements,
} from "./lib/renderer.mjs";

function routeParts() {
  const parts = window.location.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length < 4 || parts[0] !== "problem") return null;
  return {
    member: decodeURIComponent(parts[1]),
    date: decodeURIComponent(parts[2]),
    problemId: decodeURIComponent(parts[3]),
  };
}

function actionButton(symbol, label, handler, title) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-outline btn-sm review-detail-action";
  button.innerHTML = `${icon(symbol)}${label}`;
  button.title = title;
  button.addEventListener("click", () => handler(button));
  return button;
}

(async function bootstrapProblemPage() {
  initTheme();
  initDetailInteractions();
  document.getElementById("btn-theme")?.addEventListener("click", toggleTheme);
  document.getElementById("btn-login")?.addEventListener("click", login);
  document.getElementById("btn-logout")?.addEventListener("click", logout);
  await initSession();

  const route = routeParts();
  const root = document.getElementById("problem-detail");
  if (!route || !root) return;
  root.addEventListener("click", (event) => {
    const link = event.target.closest('.detail-tabs a[href^="#"]');
    if (!link) return;
    event.preventDefault();
    const target = document.getElementById(link.hash.slice(1));
    window.history.replaceState(null, "", `${window.location.pathname}${link.hash}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, true);
  await renderEnhancements(root);

  let detailPromise;
  const detail = () => detailPromise ??= loadProblemDetail(route.member, route.date, route.problemId);
  document.getElementById("btn-export-pdf")?.addEventListener("click", async () => exportToPDF(await detail()));
  document.getElementById("btn-export-md")?.addEventListener("click", async () => exportToMD(await detail()));
  document.getElementById("btn-export-latex")?.addEventListener("click", async () => exportToLatex(await detail()));

  if (currentUser?.member !== route.member) return;
  const log = await detail();
  const edit = root.querySelector("[data-problem-edit]");
  const review = root.querySelector("[data-problem-review]");
  if (edit) {
    edit.hidden = false;
    const link = document.createElement("a");
    link.className = "btn btn-outline btn-sm review-detail-action";
    link.href = `/submit/?date=${encodeURIComponent(route.date)}&problem=${encodeURIComponent(route.problemId)}`;
    link.innerHTML = `${icon("pen")}编辑此题`;
    link.title = "打开该日期的提交表单并定位到本题";
    edit.append(link);
  }
  if (review) {
    review.hidden = false;
    review.append(
      actionButton("check", "结束复习", (button) => quickReviewAction(log, "archive", button), "结束本题复习安排"),
      actionButton("clock", "顺延 +3", (button) => quickReviewAction(log, "snooze", button), "复习日期顺延 3 天"),
    );
  }
})().catch((error) => console.error("题目详情初始化失败", error));
