import { escapeHtml } from "./escape-html.mjs";
import { roadmapOverviewHtml, roadmapPhaseHtml, roadmapNodeHtml, tagPageHtml, tagIndexHtml } from "./roadmap.mjs";
import { syncRoadmapOverviewView } from "./detail-interactions.mjs";
import { loadRoadmapNode, loadTagDetail } from "./data.mjs";
import { filterTagIndex, tagStorageKey } from "./tag-index.mjs";

// 知识地图渲染器：/roadmap/（主题总览）、/roadmap/<group>/（主题分组）、/roadmap/<group>/<node>/（参考题）。
// roadmapDataProvider 为惰性数据源（() => Promise<roadmapData>）：首屏命中预渲染内容时
// 不会调用它，roadmap.json 仅在刷新或进入新页面时按需拉取。
export function renderRoadmap(roadmapDataProvider, navigation = {}) {
  const view = { kind: "overview", phaseId: null, nodeId: null };
  let nodeCache = null;
  let roadmapData = null;

  const content = () => document.getElementById("roadmap-content");
  const toolbar = () => document.getElementById("roadmap-toolbar");

  const ensureData = async () => {
    if (!roadmapData) roadmapData = await roadmapDataProvider();
    return roadmapData;
  };

  async function render(kind) {
    const root = content();
    const tb = toolbar();
    try {
      if (kind === "overview") {
        tb.hidden = true;
        const data = await ensureData();
        root.innerHTML = roadmapOverviewHtml(data, "all");
        syncRoadmapOverviewView();
      } else if (kind === "phase") {
        tb.hidden = false;
        const data = await ensureData();
        root.innerHTML = roadmapPhaseHtml(data, view.phaseId, "all");
      } else if (kind === "node") {
        tb.hidden = false;
        if (!nodeCache || nodeCache.node.id !== view.nodeId) {
          root.innerHTML = `<p class="hint">正在加载题单...</p>`;
          nodeCache = await loadRoadmapNode(view.nodeId);
        }
        root.innerHTML = roadmapNodeHtml(nodeCache, "all");
        document.title = `${nodeCache.node.title} · 知识地图 · ICPC 算法训练日志`;
      }
      root.dataset.route = window.location.pathname.replace(/^\/+|\/+$/g, "");
    } catch (error) {
      root.innerHTML = `<p class="hint">加载失败：${escapeHtml(error.message)}</p>`;
    }
  }

  async function renderRoute(initial = false) {
    const routePath = window.location.pathname.replace(/^\/+|\/+$/g, "");
    const parts = routePath.split("/");
    if (parts[0] !== "roadmap") {
      // 从学习路线 SPA 跳转：tags 互切直接换渲染器（避免多拉一次 all.json）；
      // 其余日志类路由切回对应渲染器（数据缓存命中也要重建，以应用当前 URL 状态，
      // 如 /?tag= 筛选、member/analysis 等路由），并修复内容不渲染的缺口
      if (parts[0] === "tags") {
        await navigation.tags?.();
      } else if (!parts[0]) {
        await navigation.overview?.();
      } else {
        await navigation.journal?.();
      }
      return;
    }
    if (parts[1]) {
      view.phaseId = decodeURIComponent(parts[1]);
      if (parts[2]) {
        view.kind = "node";
        view.nodeId = decodeURIComponent(parts[2]);
      } else {
        view.kind = "phase";
      }
    } else {
      view.kind = "overview";
      document.title = "知识地图 · ICPC 算法训练日志";
    }
    const root = content();
    const tb = toolbar();
    tb.hidden = view.kind === "overview";
    // 首屏直链：预渲染内容与当前路由一致且为"全体成员"时直接使用，零 JSON 请求、无重渲染闪烁
    if (
      initial &&
      root &&
      root.dataset.route === routePath &&
      root.innerHTML.trim() !== ""
    ) {
      if (view.kind === "overview") syncRoadmapOverviewView();
      return;
    }
    await render(view.kind);
  }

  window.journalRouteRenderer = renderRoute;
  // 直链/深链首次加载时即按当前路径渲染；命中预渲染内容时跳过（见 renderRoute initial 分支）
  renderRoute(true);
  return { render, renderRoute };
}

// 标签渲染器：/tags/（索引）、/tags/<标签>/（标签页）
// tagIndexProvider 为惰性数据源（() => Promise<tagIndex>）：首屏命中预渲染内容时
// 不会调用它，tag-index.json 只在 SPA 跳转 / 刷新时按需拉取。
export function renderTags(tagIndexProvider, navigation = {}) {
  const content = () => document.getElementById("tag-content");
  const titleEl = () => document.getElementById("tag-page-title");
  const subtitleEl = () => document.getElementById("tag-page-subtitle");
  const toolbar = () => document.getElementById("tag-toolbar");
  let tagIndex = null;

  const ensureData = async () => {
    if (!tagIndex) tagIndex = await tagIndexProvider();
    return tagIndex;
  };

  async function render(kind, tag) {
    const root = content();
    try {
      if (kind === "index") {
        const data = await ensureData();
        root.innerHTML = tagIndexHtml(data);
        root.dataset.route = "tags";
        delete root.dataset.tag;
        toolbar().hidden = true;
        titleEl().textContent = "标签索引";
        subtitleEl().textContent = `用标签串联知识，构建属于你的算法知识体系。共 ${data.tags.length} 个标签。`;
        const controls = document.getElementById("tag-index-controls");
        if (controls) controls.hidden = false;
        filterTagIndex();
        document.title = "标签索引 · ICPC 算法训练日志";
      } else {
        toolbar().hidden = false;
        const data = await ensureData();
        let entry = (data.tags || []).find((t) => t.tag === tag || tagStorageKey(t.tag) === tag);
        if (!entry) {
          root.innerHTML = `<p class="hint">未找到标签「${escapeHtml(tag)}」。</p>`;
          return;
        }
        if (!Array.isArray(entry.records)) entry = await loadTagDetail(entry.tag);
        root.innerHTML = tagPageHtml(entry);
        root.dataset.tag = entry.tag;
        delete root.dataset.route;
        titleEl().textContent = entry.tag;
        subtitleEl().textContent = `${entry.recordCount} 条训练记录 · ${entry.nodes.length} 个知识主题关联`;
        const controls = document.getElementById("tag-index-controls");
        if (controls) controls.hidden = true;
        document.title = `${entry.tag} · 标签 · ICPC 算法训练日志`;
      }
    } catch (error) {
      root.innerHTML = `<p class="hint">加载失败：${escapeHtml(error.message)}</p>`;
    }
  }

  async function renderRoute(initial = false) {
    const routePath = window.location.pathname.replace(/^\/+|\/+$/g, "");
    const parts = routePath.split("/");
    if (parts[0] !== "tags") {
      // 从标签页 SPA 跳转：roadmap 互切直接换渲染器（避免多拉一次 all.json）；
      // 其余日志类路由切回对应渲染器（数据缓存命中也要重建，以应用当前 URL 状态，
      // 如 /?tag= 筛选、member/analysis 等路由），并修复内容不渲染的缺口
      if (parts[0] === "roadmap") {
        await navigation.roadmap?.();
      } else if (!parts[0]) {
        await navigation.overview?.();
      } else {
        await navigation.journal?.();
      }
      return;
    }
    const root = content();
    if (parts[1]) {
      let tag = parts[1];
      try {
        tag = decodeURIComponent(parts[1]);
      } catch {
        // 畸形 % 编码 URL 兜底：原样作为标签名，通常渲染为「未找到标签」
      }
      // 首屏直链：预渲染内容与当前路由一致时直接使用，零 JSON 请求、无重渲染闪烁
      if (initial && root && tagStorageKey(root.dataset.tag) === tag && root.innerHTML.trim() !== "") return;
      await render("tag", tag);
    } else {
      // 首屏直链：预渲染索引内容与当前路由一致时直接使用
      if (initial && root && root.dataset.route === "tags" && root.innerHTML.trim() !== "") {
        filterTagIndex();
        return;
      }
      await render("index");
    }
  }

  window.journalRouteRenderer = renderRoute;
  // 直链/深链首次加载时即按当前路径渲染；命中预渲染内容时跳过（见 renderRoute initial 分支）
  renderRoute(true);
  return { render, renderRoute };
}

