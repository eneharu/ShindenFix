/*
 * ShindenFix — content script
 * Wstrzykiwany na każdej podstronie shinden.pl (document_start).
 */
(() => {
  const C = globalThis.SF;
  if (!C) return;
  if (globalThis.__shindenFixStarted) return;
  globalThis.__shindenFixStarted = true;

  const root = document.documentElement;
  if (!root) return;

  const EXT_VERSION = (() => {
    try { return chrome.runtime.getManifest().version; } catch { return "?"; }
  })();

  /* znacznik wersji widoczny w DOM i konsoli — łatwo sprawdzić, czy działa nowa wersja */
  root.setAttribute("data-sf-version", EXT_VERSION);
  console.info(`[ShindenFix] v${EXT_VERSION} aktywny na ${location.host}${location.pathname}`);

  /* ---------- ustawienia ---------- */

  const readMirror = () => {
    try {
      return JSON.parse(localStorage.getItem(C.MIRROR_KEY) || "{}") || {};
    } catch {
      return {};
    }
  };

  let S = C.normalize(readMirror());
  let bgData = "";

  const log = (...a) => { if (S.debug) console.debug("[ShindenFix]", ...a); };

  function writeMirror() {
    try {
      localStorage.setItem(C.MIRROR_KEY, JSON.stringify(S));
    } catch { /* prywatny tryb / brak dostępu */ }
  }

  /* ---------- mapa klas shindena ---------- */

  function readSiteMap() {
    try {
      const raw = root.getAttribute("data-sh-n");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  /* ---------- layout ---------- */

  function applyLayout() {
    const on = !!S.enabled;
    root.classList.toggle("sf-on", on);
    root.classList.toggle("sf-wide", on && !!S.wide);
    root.classList.toggle("sf-feed-cols", on && !!S.wide && !!S.feedColumns);
    root.classList.toggle("sf-readable", on && !!S.wide && !!S.readableText);
    root.classList.toggle("sf-square", on && !!S.squareCorners);
    root.style.setProperty("--sf-max-w", Number(S.width) > 0 ? `${Number(S.width)}px` : "100%");
  }

  function contrastOnAccent(hex) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return "#ffffff";
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 150 ? "#141018" : "#ffffff";
  }

  function applyAppearance() {
    const on = !!S.enabled;

    /* własne tło */
    const bg = on && typeof bgData === "string" && bgData.startsWith("data:image/") ? bgData : "";
    root.classList.toggle("sf-bg", !!bg);
    if (bg) {
      root.style.setProperty("--sf-bg-image", `url("${bg}")`);
      const blur = Math.max(0, Math.min(40, Number(S.bgBlur) || 0));
      root.style.setProperty("--sf-bg-blur", `${blur}px`);
    } else {
      root.style.removeProperty("--sf-bg-image");
      root.style.removeProperty("--sf-bg-blur");
    }

    /* własny kolor akcentu */
    const accent = on && /^#[0-9a-f]{6}$/i.test(S.accent || "") ? S.accent : "";
    root.classList.toggle("sf-accent", !!accent);
    if (accent) {
      root.style.setProperty("--sh-accent", accent);
      root.style.setProperty("--sh-accent-soft", `color-mix(in srgb, ${accent} 22%, var(--sh-surface))`);
      root.style.setProperty("--sh-link", accent);
      root.style.setProperty("--sh-focus", accent);
      root.style.setProperty("--sh-btn-border", accent);
      root.style.setProperty("--sh-control-border", accent);
      root.style.setProperty("--sh-nav-szklo-obwodka", `color-mix(in srgb, ${accent} 40%, transparent)`);
      root.style.setProperty("--sh-on-accent", contrastOnAccent(accent));
    } else {
      for (const p of [
        "--sh-accent",
        "--sh-accent-soft",
        "--sh-link",
        "--sh-focus",
        "--sh-btn-border",
        "--sh-control-border",
        "--sh-nav-szklo-obwodka",
        "--sh-on-accent"
      ]) {
        root.style.removeProperty(p);
      }
    }
  }

  /* ---------- reklamy: selektory ---------- */

  let adHideSelector = "";
  let adRemoveSelector = "";
  let noteSelector = "";
  let extraSelectors = [];

  function buildAdSelectors() {
    const map = readSiteMap();

    const hashes = [];
    for (const key of C.AD_SEMANTIC) {
      const hash = map[key];
      if (hash) hashes.push(hash);
    }

    const keep = new Set();
    for (const key of C.KEEP_SEMANTIC || []) {
      if (map[key]) keep.add(map[key]);
    }

    const stable = [...C.AD_SELECTORS];

    /* kreacje shindena: link do /l/ z rel="sponsored" */
    stable.push("div:has(> a[href^='/l/'])");

    adHideSelector = [...new Set([
      ...hashes.map((h) => "." + CSS.escape(h)),
      ...stable
    ])].join(",");

    adRemoveSelector = [...new Set([
      ...hashes.filter((h) => !keep.has(h)).map((h) => "." + CSS.escape(h)),
      ...stable
    ])].join(",");

    return { hide: adHideSelector, remove: adRemoveSelector };
  }

  function buildNoteSelector() {
    const map = readSiteMap();
    const parts = [];
    for (const key of C.NOTE_SEMANTIC) {
      if (map[key]) parts.push("." + CSS.escape(map[key]));
    }
    noteSelector = parts.join(",");
    return noteSelector;
  }

  function buildExtraSelectors() {
    extraSelectors = [];
    if (!(S.extraCleanup && Array.isArray(S.extraSelectors))) return extraSelectors;
    for (const raw of S.extraSelectors) {
      const s = String(raw).trim();
      if (!s) continue;
      try {
        if (CSS.supports && !CSS.supports(`selector(${s})`)) {
          log("nieprawidłowy selektor (pomijam):", s);
          continue;
        }
      } catch { continue; }
      extraSelectors.push(s);
    }
    return extraSelectors;
  }

  function ensureStyle() {
    let style = document.getElementById("sf-ad-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "sf-ad-style";
      (document.head || root).appendChild(style);
    }

    const blocks = [];
    if (S.enabled && S.ads) {
      buildAdSelectors();
      if (adHideSelector) blocks.push(`${adHideSelector}{display:none !important}`);
    }
    if (S.enabled && S.adNotes) {
      const sel = buildNoteSelector();
      if (sel) blocks.push(`${sel}{display:none !important}`);
    }
    if (S.enabled) {
      for (const sel of buildExtraSelectors()) {
        blocks.push(`${sel}{display:none !important}`);
      }
      for (const sel of C.REMOVE_SELECTORS || []) {
        blocks.push(`${sel}{display:none !important}`);
      }
    }

    const css = blocks.join("\n");
    if (style.textContent !== css) style.textContent = css;
  }

  /* ---------- reklamy: usuwanie z DOM ---------- */

  function removeMatching(selector, counter) {
    try {
      for (const el of document.querySelectorAll(selector)) {
        el.remove();
        counter.n++;
      }
    } catch (e) {
      log("błąd selektora:", selector, e);
    }
  }

  function removeAdsNow() {
    const counter = { n: 0 };
    if (!S.enabled) return 0;

    if (S.ads) {
      if (!adRemoveSelector) buildAdSelectors();
      removeMatching(adRemoveSelector, counter);

      /* kreacje "sponsorowane" (autopromocja shindena) */
      try {
        for (const a of document.querySelectorAll(C.SPONSORED_SELECTOR)) {
          const box = a.parentElement;
          if (box && box.tagName !== "BODY") {
            box.remove();
            counter.n++;
          }
        }
      } catch (e) {
        log("błąd selektora sponsored", e);
      }
    }

    if (S.adNotes) {
      if (!noteSelector) buildNoteSelector();
      if (noteSelector) removeMatching(noteSelector, counter);
    }

    if (S.extraCleanup) {
      if (!extraSelectors.length) buildExtraSelectors();
      for (const sel of extraSelectors) removeMatching(sel, counter);
    }

    /* stałe elementy strony (np. kafelek Discord) */
    for (const sel of C.REMOVE_SELECTORS || []) removeMatching(sel, counter);

    /* reguły tekstowe — usuwamy najmniejszy pasujący element */
    const textRules = Array.isArray(C.TEXT_RULES) ? C.TEXT_RULES : [];
    for (const rule of textRules) {
      if (!rule || !(rule.text instanceof RegExp) || !rule.selector) continue;
      try {
        const all = [...document.querySelectorAll(rule.selector)].filter((el) => rule.text.test(el.textContent || ""));
        const set = new Set(all);
        for (const el of all) {
          let hasMatchingChild = false;
          for (const child of el.querySelectorAll(rule.selector)) {
            if (set.has(child)) { hasMatchingChild = true; break; }
          }
          if (!hasMatchingChild) {
            el.remove();
            counter.n++;
          }
        }
      } catch (e) {
        log("błąd reguły tekstowej", e);
      }
    }

    if (counter.n) log(`usunięto ${counter.n} element(ów)`);
    return counter.n;
  }

  /* ---------- obejście bramki anty-adblock przed playerami ---------- */

  /*
   * Bramka sprawdza `event.nativeEvent.isTrusted`, więc zwykłe .click()
   * jest ignorowane. Pomocnik `src/gate-main.js` (world: "MAIN") wywołuje
   * handlery Reacta bezpośrednio po zdarzeniu "sf:bypass-gate".
   */
  let gateTimer = null;

  function bypassAdblockGate() {
    if (!S.enabled) return;

    const btn = [...document.querySelectorAll("button")].find((b) =>
      /pokaż playery/i.test((b.textContent || "").trim())
    );
    if (!btn) return;

    /* nie klikaj w kółko, jeśli bramka z jakiegoś powodu zostaje */
    const now = Date.now();
    if (now - Number(btn.dataset.sfGateTs || 0) < 1200) return;
    btn.dataset.sfGateTs = now;

    /* właściwe obejście: helper w świecie strony */
    try {
      document.dispatchEvent(new CustomEvent("sf:bypass-gate"));
    } catch { /* ignore */ }

    /* awaryjnie zwykłe kliknięcia — tylko gdy helper nie jest dostępny */
    if (!root.hasAttribute("data-sf-gate-helper")) {
      const wrap = btn.parentElement;
      const checkbox = wrap ? wrap.querySelector("input[type='checkbox']") : null;
      if (checkbox && !checkbox.checked) {
        try { checkbox.click(); } catch { /* ignore */ }
      }
      clearTimeout(gateTimer);
      gateTimer = setTimeout(() => {
        try { btn.click(); } catch { /* ignore */ }
      }, 80);
    }
  }

  /* ---------- opisy: zdanie na linię ---------- */

  let sentenceSegmenter = null;
  try { sentenceSegmenter = new Intl.Segmenter("pl", { granularity: "sentence" }); } catch { /* ignore */ }

  const ABBREV_END = /(?:^|[\s(])(?:np|m\.in|itd|itp|tj|tzn|tzw|dr|prof|mgr|inż|hab|ul|al|pl|nr|str|pkt|art|ust|r|w|z|ok|godz|min|sek|tys|mln|mld|vs|vol|no|p\.p)\.$/i;

  function splitSentences(text) {
    if (!sentenceSegmenter) return [text];

    const parts = [...sentenceSegmenter.segment(text)]
      .map((s) => s.segment.trim())
      .filter(Boolean);
    if (parts.length < 2) return parts.length ? parts : [text];

    const merged = [];
    for (const part of parts) {
      /* nie łam po skrótach typu "m.in.", "np.", "itd." */
      if (merged.length && ABBREV_END.test(merged[merged.length - 1])) {
        merged[merged.length - 1] += " " + part;
      } else {
        merged.push(part);
      }
    }
    return merged;
  }

  function formatDescriptions() {
    if (!S.enabled || !S.readableText) return;

    for (const box of document.querySelectorAll(".sh-d--opis")) {
      if (box.dataset.sfSentences === "1") continue;
      box.dataset.sfSentences = "1";

      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent || parent.closest("script, style, code, pre")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);

      for (const node of nodes) {
        if (node.nodeValue.trim().length < 30) continue;
        const sentences = splitSentences(node.nodeValue);
        if (sentences.length < 2) continue;

        const fragment = document.createDocumentFragment();
        sentences.forEach((sentence, index) => {
          if (index) fragment.appendChild(document.createTextNode(" "));
          const span = document.createElement("span");
          span.className = "sf-sentence";
          span.textContent = sentence;
          fragment.appendChild(span);
        });
        node.replaceWith(fragment);
      }
    }
  }

  /* ---------- pętla ---------- */

  let timer = null;

  function run() {
    if (!S.enabled) return;
    bypassAdblockGate();
    removeAdsNow();
    formatDescriptions();
  }

  function schedule(delay = 120) {
    if (timer || !S.enabled) return;
    timer = setTimeout(() => {
      timer = null;
      run();
    }, delay);
  }

  function applyAll() {
    /* ustawienia mogły się zmienić — przebuduj cache */
    adHideSelector = "";
    adRemoveSelector = "";
    noteSelector = "";
    extraSelectors = [];
    applyLayout();
    applyAppearance();
    ensureStyle();
    schedule(0);
  }

  /* ---------- reakcja na zmiany DOM ---------- */

  const observer = new MutationObserver(() => schedule());
  try {
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "style"]
    });
  } catch { /* ignore */ }

  /* Reklamy potrafią dosypywać się długo po loadzie (CMP, Criteo, rotacja). */
  setInterval(() => {
    if (document.visibilityState !== "hidden") schedule(0);
  }, 2500);

  /* ---------- synchronizacja ustawień ---------- */

  function onStorageChanged(changes, area) {
    if (area !== "local") return;
    let changed = false;

    if (changes[C.STORAGE_KEY]) {
      S = C.normalize(changes[C.STORAGE_KEY].newValue);
      writeMirror();
      changed = true;
    }

    if (changes[C.BG_KEY]) {
      const value = changes[C.BG_KEY].newValue;
      bgData = typeof value === "string" ? value : "";
      changed = true;
    }

    if (changed) applyAll();
  }

  /* odpowiedź dla popupu: czy wtyczka działa na tej karcie i w jakiej wersji */
  try {
    chrome.runtime.onMessage.addListener((msg, sender, respond) => {
      if (!msg || msg.type !== "sf:ping") return;
      respond({ ok: true, version: EXT_VERSION, url: location.href, enabled: !!S.enabled });
    });
  } catch { /* ignore */ }

  try {
    chrome.storage.local.get([C.STORAGE_KEY, C.BG_KEY], (res) => {
      if (chrome.runtime.lastError) {
        log("storage:", chrome.runtime.lastError.message);
        return;
      }
      S = C.normalize(res && res[C.STORAGE_KEY]);
      const value = res && res[C.BG_KEY];
      bgData = typeof value === "string" ? value : "";
      writeMirror();
      applyAll();
    });
    chrome.storage.onChanged.addListener(onStorageChanged);
  } catch {
    /* brak API storage — działamy na ustawieniach domyślnych */
  }

  /* ---------- start ---------- */

  applyAll();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyAll, { once: true });
  } else {
    applyAll();
  }

  window.addEventListener("load", applyAll, { once: true });

  globalThis.__shindenFix = { get settings() { return S; }, sweep: run };
})();
