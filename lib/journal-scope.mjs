export function journalScopeForRoute(route) {
  if (route === "analysis" || route === "report") return "analysis";
  if (route === "review") return "review";
  if (route.startsWith("member/")) return `member:${decodeURIComponent(route.slice("member/".length))}`;
  return route ? null : "overview";
}
