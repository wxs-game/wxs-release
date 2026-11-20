"use strict";

(() => {
  const initData = window.Telegram?.WebApp?.initData;
  if (!window.WXS_ROUTE || !initData) return;

  const root = document.documentElement;
  const config = window.WXS_CONFIG;
  root.classList.add("wxs-access-pending");

  function screen(status, linked) {
    const render = () => {
      const panel = document.createElement("main");
      panel.id = "wxs-antitwink-gate";
      panel.setAttribute("aria-live", "polite");
      const card = document.createElement("div");
      const image = document.createElement("img");
      image.src = status === "blocked" ? "antitwink/lock.webp" : "antitwink/shield.webp";
      image.alt = "";
      image.width = image.height = 60;
      const heading = document.createElement("h1");
      const body = document.createElement("p");
      const action = document.createElement("a");

      if (status === "required") {
        heading.textContent = "Сначала пройдите проверку";
        body.textContent = "Откройте WXS GAME в Telegram для автоматической проверки сети и устройства.";
      } else if (status === "blocked") {
        heading.textContent = "Доступ закрыт";
        const names = linked.slice(0, 5).map((peer) => peer.username ? "@" + peer.username : "ID " + peer.id);
        if (linked.length > names.length) names.push("ещё " + (linked.length - names.length));
        body.textContent = names.length ? "Связанные аккаунты — " + names.join(", ") : "Обнаружена связь между аккаунтами.";
      } else {
        heading.textContent = "Не удалось проверить доступ";
        body.textContent = "Попробуйте обновить страницу или заново открыть игру из бота.";
      }
      action.href = status === "error" ? location.href : "https://t.me/wxsgame?start=antitwink";
      action.textContent = status === "error" ? "Обновить" : "Открыть WXS GAME";
      action.addEventListener("click", (event) => {
        if (status !== "error" && window.Telegram?.WebApp?.openTelegramLink) {
          event.preventDefault();
          window.Telegram.WebApp.openTelegramLink(action.href);
        }
      });
      card.append(image, heading, body, action);
      panel.append(card);
      document.body.append(panel);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, { once: true });
    else render();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let allowed = false;
  const rpc = (name) => fetch(config.supabaseUrl + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: { apikey: config.supabaseKey, "Content-Type": "application/json" },
    body: JSON.stringify({ p_init: initData }),
    signal: controller.signal,
  });
  async function getAccess() {
    const response = await rpc("wxs_antitwink_game_status");
    const result = await response.json();
    if (response.ok) return result;
    if (response.status !== 404 || result.code !== "PGRST202") throw new Error("WXS access check failed");

    // GitHub Pages can publish before the database migration is applied.
    const legacy = await rpc("wxs_app_access");
    if (!legacy.ok) throw new Error("WXS access check failed");
    return { status: await legacy.json() === true ? "approved" : "denied" };
  }

  window.WXS_APP_ACCESS = getAccess().then((result) => {
    if (result.status === "approved") {
      allowed = true;
      return true;
    }
    if (result.status === "denied") document.title = "";
    else screen(result.status, result.linked || []);
    return false;
  }).catch(() => {
    screen("error", []);
    return false;
  }).finally(() => {
    clearTimeout(timeout);
    if (!allowed) root.classList.add("wxs-access-denied");
    root.classList.remove("wxs-access-pending");
  });
})();
