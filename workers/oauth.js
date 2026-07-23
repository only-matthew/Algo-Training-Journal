export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // GET / → 重定向到 GitHub 授权页
    if (request.method === "GET") {
      const redirect = url.searchParams.get("redirect") || "/";
      const state = encodeURIComponent(redirect);
      const authUrl =
        `https://github.com/login/oauth/authorize` +
        `?client_id=${env.GITHUB_CLIENT_ID}` +
        `&scope=public_repo` +
        `&state=${state}`;
      return Response.redirect(authUrl, 302);
    }

    // POST / → 用 code 换 access_token
    if (request.method === "POST") {
      const { code, state } = await request.json();
      const resp = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      const data = await resp.json();
      const redirect = state ? decodeURIComponent(state) : "/";
      // 通过 Cookie 设置 token 并重定向
      if (data.access_token) {
        const token = data.access_token;
        // 把 token 带回前端（通过 URL hash）
        const target = new URL(redirect);
        target.hash = `token=${token}`;
        return Response.redirect(target.toString(), 302);
      }
      return new Response("OAuth failed: " + JSON.stringify(data), { status: 400 });
    }

    return new Response("Not found", { status: 404 });
  },
};