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

function updateThemeIcon(theme) {
  const btn = document.getElementById("btn-theme");
  if (!btn) return;
  btn.textContent = theme === THEME_DARK ? "☀️" : "🌙";
  btn.title = theme === THEME_DARK ? "切换为浅色模式" : "切换为暗色模式";
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

export function toggleTheme() {
  const current = getTheme();
  const next = current === THEME_DARK ? THEME_LIGHT : THEME_DARK;
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

export function initTheme() {
  applyTheme(getTheme());

  // Listen for system theme changes — only take effect when user hasn't manually chosen
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!localStorage.getItem(THEME_KEY)) {
      applyTheme(getSystemTheme());
    }
  });
}
