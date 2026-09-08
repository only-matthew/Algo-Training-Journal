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
  const accountLabel = document.getElementById("account-label");
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
    statusEl.replaceChildren(img);
    statusEl.title = user.member || user.login;
    if (accountLabel) accountLabel.textContent = user.member || user.login;
    btnLogin.style.display = "none";
    btnLogout.style.display = "";
    btnSubmit.style.display = "";
    const mobileProfile = document.getElementById("mobile-profile-link");
    if (mobileProfile && user.member) mobileProfile.href = `/member/${encodeURIComponent(user.member)}/`;
  } else {
    statusEl.innerHTML = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/></svg>';
    statusEl.title = "未登录";
    if (accountLabel) accountLabel.textContent = "公开浏览";
    btnLogin.style.display = "";
    btnLogout.style.display = "none";
    btnSubmit.style.display = "";
  }
}

export async function initSession() {
  try { currentUser = await loadSession(); } catch { currentUser = null; }
  updateAuthUI(currentUser);
}
