"use strict";

const telegram = window.Telegram?.WebApp;
const endpoint = "https://nkovsjhwinbbapsqvpnu.supabase.co/rest/v1/rpc/wxs_antitwink_web";
const publicKey = "sb_publishable_GVUZWdR9qVSHwL7aL63W8w_g7rtfJkN";
const botUrl = "https://t.me/wxsgame";
const deviceStorageKey = "wxs.verification.device";
const next = new URLSearchParams(location.search).get("next") || "";
const returnUrl = /^(?:ac_[A-Za-z0-9]{8}|crash|upgrader)$/.test(next) ? botUrl + "?start=" + next : botUrl + "?start=antitwink";
const button = document.getElementById("action");
const settings = document.getElementById("settings");
const description = document.getElementById("description");
const title = document.getElementById("title");
const hero = document.getElementById("hero-icon");
const signals = document.getElementById("signals");
const linked = document.getElementById("linked");
const note = document.getElementById("message");
const privacy = document.getElementById("privacy");
let action = lookup;

function openBot() {
  if (telegram?.initData && telegram.openTelegramLink) {
    telegram.openTelegramLink(returnUrl);
    return;
  }
  location.assign(returnUrl);
}

function show(state, message = "") {
  document.body.dataset.state = state;
  note.hidden = !message;
  note.textContent = message;
  linked.hidden = true;
  signals.hidden = state !== "required" && state !== "checking";
  privacy.hidden = signals.hidden;
  settings.hidden = !(state === "required" && message && telegram?.LocationManager?.isLocationAvailable);
  button.disabled = state === "checking" || state === "loading";
  hero.src = state === "approved" ? "approved.webp" : state === "blocked" ? "lock.webp" : "shield.webp";
  const views = {
    required: ["Проверка аккаунта", "Подтвердите устройство и примерную локацию, чтобы открыть доступ к WXS GAME.", message ? "Попробовать ещё раз" : "Разрешить и проверить", submit],
    checking: ["Проверка аккаунта", "Подтвердите запрос на доступ к локации в Telegram.", "Идёт проверка…", submit],
    loading: ["Проверка аккаунта", "Получаем статус проверки в WXS GAME.", "Проверяем доступ…", lookup],
    approved: ["Доступ открыт", "Проверка пройдена. Вернитесь в бот, чтобы продолжить.", "Продолжить в боте", openBot],
    blocked: ["Доступ закрыт", "Обнаружена связь с другими аккаунтами. Пополнения, выводы, чеки, дуэли и игры недоступны.", "Вернуться в бот", openBot],
    outside: ["Откройте в Telegram", "Запустите проверку из личного чата с WXS GAME.", "Открыть WXS GAME", openBot],
    expired: ["Сессия завершилась", "Откройте проверку заново из личного чата с WXS GAME.", "Вернуться в бот", openBot],
    error: ["Проверка недоступна", "Попробуйте ещё раз через несколько секунд.", "Проверить ещё раз", lookup],
  };
  const [heading, detail, label, callback] = views[state];
  title.textContent = heading;
  description.textContent = detail;
  button.textContent = label;
  action = callback;
}

function showResult(result) {
  if (!["approved", "required", "blocked"].includes(result.status)) {
    show("error");
    return;
  }
  show(result.status);
  if (result.status !== "blocked") return;
  linked.replaceChildren();
  for (const peer of result.linked || []) {
    const row = document.createElement("li");
    const icon = document.createElement("img");
    icon.src = "profile.webp";
    icon.alt = "";
    icon.width = icon.height = 24;
    const name = document.createElement("span");
    name.textContent = peer.username ? "@" + peer.username + " · ID " + peer.id : "ID " + peer.id;
    row.append(icon, name);
    linked.append(row);
  }
  linked.hidden = !linked.childElementCount;
}

async function request(body = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { apikey: publicKey, "Content-Type": "application/json" },
      body: JSON.stringify({ p_init: telegram.initData, ...body }),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error("Verification request failed");
      error.sessionExpired = result.code === "28000";
      throw error;
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function lookup() {
  if (!telegram?.initData) {
    show("outside");
    return;
  }
  show("loading");
  try {
    showResult(await request());
  } catch (error) {
    show(error.sessionExpired ? "expired" : "error");
  }
}

function within(start, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Location timeout")), timeout);
    start((value) => {
      clearTimeout(timer);
      value ? resolve(value) : reject(new Error("Location unavailable"));
    });
  });
}

async function getLocation() {
  const manager = telegram?.LocationManager;
  if (manager && telegram.isVersionAtLeast("8.0")) {
    try {
      if (!manager.isInited) await within((done) => manager.init(() => done(true)), 2500);
    } catch {
      // Older Telegram builds can leave the LocationManager callback unanswered.
    }
    if (manager.isLocationAvailable) return within((done) => manager.getLocation(done));
  }
  if (!navigator.geolocation) throw new Error("Location unavailable");
  return within((done) => navigator.geolocation.getCurrentPosition(
    ({ coords }) => done(coords), () => done(null), { timeout: 15000, maximumAge: 60000 }
  ), 16000);
}

function locationCell({ latitude, longitude }) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error("Invalid location");
  }
  const latCell = Math.min(8999, Math.floor((latitude + 90) * 50));
  const lonCell = Math.min(17999, Math.floor((longitude + 180) * 50));
  return latCell + ":" + lonCell;
}

function localDeviceMarker() {
  const getOrCreate = () => {
    const saved = localStorage.getItem(deviceStorageKey);
    if (/^[a-f0-9]{64}$/.test(saved || "")) return saved;
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const marker = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(deviceStorageKey, marker);
    if (localStorage.getItem(deviceStorageKey) !== marker) throw new Error("Storage unavailable");
    return marker;
  };
  return navigator.locks ? navigator.locks.request(deviceStorageKey, getOrCreate) : getOrCreate();
}

async function deviceMarker() {
  const manager = telegram?.BiometricManager;
  if (manager && telegram.isVersionAtLeast("7.2")) {
    try {
      if (!manager.isInited) await within((done) => manager.init(() => done(true)), 2000);
      const id = manager.deviceId || "";
      if (manager.isBiometricAvailable && /^[a-zA-Z0-9_:-]{12,200}$/.test(id)) {
        const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("wxs-device:" + id));
        return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
      }
    } catch {
      // No biometric authentication or enrollment is needed for the local fallback.
    }
  }
  return localDeviceMarker();
}

async function submit() {
  show("checking");
  let cell;
  try {
    cell = locationCell(await getLocation());
  } catch {
    show("required", "Разрешите доступ к локации в Telegram или браузере и повторите проверку.");
    return;
  }
  let marker;
  try {
    marker = await deviceMarker();
  } catch {
    show("required", "Telegram не смог сохранить метку устройства. Повторите проверку в приложении Telegram.");
    return;
  }
  try {
    const result = await request({ p_device: marker, p_location: cell });
    showResult(result);
    if (result.status === "approved") telegram.HapticFeedback?.notificationOccurred("success");
  } catch (error) {
    show(error.sessionExpired ? "expired" : "error");
  }
}

button.addEventListener("click", () => action());
settings.addEventListener("click", () => telegram?.LocationManager?.openSettings());
telegram?.ready();
telegram?.expand();
if (telegram?.isVersionAtLeast?.("6.9")) {
  telegram.setHeaderColor("#0b0b0d");
  telegram.setBackgroundColor("#0b0b0d");
}
lookup();
