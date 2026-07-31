import { loginWithGitHub, logoutSession, loadSession } from "./journal-api.js";

export let currentUser = null;

export function login() {
  loginWithGitHub();
}

export async function logout() {
  await logoutSession().catch(console.error);
  currentUser = null;
  updateAuthUI(null);
}

export function updateAuthUI(user) {
  const statusEl = document.getElementById("auth-status");
  const btnLogin = document.getElementById("btn-login");
  const btnLogout = document.getElementById("btn-logout");
  const btnSubmit = document.getElementById("btn-submit");

  if (user) {
    const img = document.createElement("img");
    img.src = user.avatar_url;
    img.className = "avatar";
    img.width = 28;
    img.height = 28;
    img.alt = "";
    statusEl.replaceChildren(img, user.login);
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

export async function initSession() {
  try { currentUser = await loadSession(); } catch { currentUser = null; }
  updateAuthUI(currentUser);
}
