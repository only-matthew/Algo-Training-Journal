export function currentRoute() {
  return window.location.pathname.replace(/^\/+|\/+$/g, "");
}

export function navigateTo(path) {
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function migrateLegacyHashRoute() {
  const route = window.location.hash.slice(1);
  if (!route) return;
  const path = route === "overview" ? "/" : `/${route}/`;
  window.history.replaceState(null, "", `${path}${window.location.search}`);
}

export function initPageNavigation() {
  const buttons = document.querySelectorAll(".page-nav-btn");
  const pages = document.querySelectorAll(".page-view");

  function showRequestedPage() {
    const route = currentRoute();
    let pageId = "overview-page";
    if (route === "analysis" || route === "report") pageId = "analysis-page";
    if (route === "review") pageId = "review-page";
    if (route === "roadmap" || route.startsWith("roadmap/")) pageId = "roadmap-page";
    if (route === "tags" || route.startsWith("tags/")) pageId = "tag-page";
    if (route.startsWith("member/")) pageId = "member-page";
    if (route.startsWith("problem/")) pageId = "problem-page";
    const exportBar = document.getElementById("export-bar");
    if (exportBar) exportBar.hidden = true;
    for (const page of pages) page.hidden = page.id !== pageId;
    for (const button of buttons) button.classList.toggle("active", button.dataset.page === pageId);
    if (typeof window.journalRouteRenderer === "function") window.journalRouteRenderer();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const route = button.dataset.page.replace("-page", "");
      navigateTo(route === "overview" ? "/" : `/${route}/`);
    });
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || link.target || link.hasAttribute("download")) return;
    event.preventDefault();
    navigateTo(`${url.pathname}${url.search}${url.hash}`);
  });
  window.addEventListener("popstate", async () => {
    const modal = document.getElementById("submit-modal");
    if (modal && modal.style.display === "flex") {
      const { closeModal } = await import("./form.mjs");
      window.history.pushState(null, "", window.location.href);
      closeModal();
      if (modal.style.display === "flex") {
        return;
      }
      return;
    }
    showRequestedPage();
  });
  showRequestedPage();
}
