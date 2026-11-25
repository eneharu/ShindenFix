/* ShindenFix - logika popupu */
(() => {
  const C = globalThis.SF;
  const D = C.DEFAULTS;

  const $ = (id) => document.getElementById(id);
  const el = {
    enabled: $("enabled"),
    wide: $("wide"),
    width: $("width"),
    widthValue: $("widthValue"),
    fullWidth: $("fullWidth"),
    widthBox: $("widthBox"),
    feedColumns: $("feedColumns"),
    readableText: $("readableText"),
    bgFile: $("bgFile"),
    pickBg: $("pickBg"),
    clearBg: $("clearBg"),
    bgPreview: $("bgPreview"),
    bgPreviewImg: $("bgPreviewImg"),
    bgBlur: $("bgBlur"),
    blurValue: $("blurValue"),
    blurBox: $("blurBox"),
    accent: $("accent"),
    accentReset: $("accentReset"),
    squareCorners: $("squareCorners"),
    ads: $("ads"),
    adNotes: $("adNotes"),
    blockNetworks: $("blockNetworks"),
    extraCleanup: $("extraCleanup"),
    extraSelectors: $("extraSelectors"),
    debug: $("debug"),
    status: $("status")
  };

  let state = Object.assign({}, D);
  let bgData = "";
  let saveTimer = null;
  let statusTimer = null;
  let previewSrc = null;

  /* wersja z manifestu - zawsze zgodna z tym, co realnie działa */
  try {
    document.querySelector(".version").textContent = chrome.runtime.getManifest().version;
  } catch { /* ignore */ }

  function setConn(text, kind = "") {
    const node = $("conn");
    if (!node) return;
    node.textContent = text;
    node.className = kind ? `conn is-${kind}` : "conn";
  }

  function pingActiveTab() {
    try {
      chrome.tabs.query({ active: true, currentWindow: true, url: "*://*.shinden.pl/*" }, (tabs) => {
        const tab = tabs && tabs[0];
        if (!tab || !tab.id) {
          setConn("Otwórz shinden.pl, aby sprawdzić status", "warn");
          return;
        }
        chrome.tabs.sendMessage(tab.id, { type: "sf:ping" }, (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) {
            setConn("Wtyczka nieaktywna na tej karcie - odśwież shinden.pl", "warn");
            return;
          }
          setConn(`Aktywna · v${res.version}${res.enabled ? "" : " · wyłączona"}`, res.enabled ? "ok" : "warn");
        });
      });
    } catch {
      setConn("Nie można sprawdzić karty", "warn");
    }
  }
  pingActiveTab();

  /* ---------- pomocnicze ---------- */

  function status(text, kind = "") {
    el.status.textContent = text;
    el.status.className = kind ? `is-${kind}` : "";
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      el.status.textContent = "Ustawienia zapisują się automatycznie";
      el.status.className = "";
    }, 2200);
  }

  function render() {
    el.enabled.checked = !!state.enabled;
    el.wide.checked = !!state.wide;
    el.feedColumns.checked = !!state.feedColumns;
    el.readableText.checked = !!state.readableText;
    el.ads.checked = !!state.ads;
    el.adNotes.checked = !!state.adNotes;
    el.blockNetworks.checked = !!state.blockNetworks;
    el.extraCleanup.checked = !!state.extraCleanup;
    el.debug.checked = !!state.debug;
    el.squareCorners.checked = !!state.squareCorners;

    const blur = Math.max(0, Math.min(40, Number(state.bgBlur) || 0));
    el.bgBlur.value = blur;
    el.blurValue.textContent = `${blur} px`;
    el.blurBox.classList.toggle("is-off", !bgData);

    const hasAccent = /^#[0-9a-f]{6}$/i.test(state.accent || "");
    if (document.activeElement !== el.accent) {
      el.accent.value = hasAccent ? state.accent : "#bd77fa";
    }
    el.accentReset.disabled = !hasAccent;

    if (bgData !== previewSrc) {
      previewSrc = bgData;
      if (bgData) {
        el.bgPreviewImg.src = bgData;
      } else {
        el.bgPreviewImg.removeAttribute("src");
      }
    }
    el.bgPreview.hidden = !bgData;
    el.clearBg.disabled = !bgData;

    const full = !(Number(state.width) > 0);
    el.fullWidth.checked = full;
    el.width.disabled = full;
    el.width.value = full ? 2000 : Number(state.width);
    el.widthValue.textContent = full ? "100%" : `${Number(state.width)} px`;
    el.widthBox.classList.toggle("is-off", !state.wide);

    if (document.activeElement !== el.extraSelectors) {
      el.extraSelectors.value = (Array.isArray(state.extraSelectors) ? state.extraSelectors : []).join("\n");
    }
  }

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      chrome.storage.local.set({ [C.STORAGE_KEY]: state }, () => {
        if (chrome.runtime.lastError) {
          status("Błąd zapisu: " + chrome.runtime.lastError.message, "warn");
        } else {
          status("Zapisano", "ok");
        }
      });
    }, 180);
  }

  function update(patch) {
    Object.assign(state, patch);
    render();
    persist();
  }

  /* ---------- własne tło ---------- */

  function loadImageFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Nie udało się wczytać obrazu"));
      };
      img.src = url;
    });
  }

  async function imageToDataUrl(file) {
    const img = await loadImageFile(file);

    const maxW = 3440;
    const maxH = 1600;
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    let data = canvas.toDataURL("image/webp", 0.82);
    if (!data.startsWith("data:image/webp")) data = canvas.toDataURL("image/jpeg", 0.85);

    /* awaryjnie mniejszy obraz, gdyby zapis był za duży */
    if (data.length > 4_500_000) {
      const small = document.createElement("canvas");
      const s2 = Math.min(1, 2200 / w);
      small.width = Math.round(w * s2);
      small.height = Math.round(h * s2);
      small.getContext("2d").drawImage(canvas, 0, 0, small.width, small.height);
      data = small.toDataURL("image/jpeg", 0.72);
    }

    return data;
  }

  /* ---------- blokada sieci reklamowych (DNR) ---------- */

  async function applyDnr(enabled) {
    if (!chrome.declarativeNetRequest) {
      status("Brak uprawnień do blokady sieci", "warn");
      return;
    }
    try {
      if (enabled) {
        await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ["ads"] });
      } else {
        await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ["ads"] });
      }
      status("Odśwież stronę, aby zastosować", "warn");
    } catch (e) {
      status("Błąd blokady: " + e.message, "warn");
    }
  }

  /* ---------- wczytanie ---------- */

  chrome.storage.local.get([C.STORAGE_KEY, C.BG_KEY], (res) => {
    state = C.normalize(res ? res[C.STORAGE_KEY] : null);
    const bg = res ? res[C.BG_KEY] : "";
    bgData = typeof bg === "string" ? bg : "";
    render();

    if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.getEnabledRulesets) {
      chrome.declarativeNetRequest.getEnabledRulesets((ids) => {
        if (chrome.runtime.lastError) return;
        const on = (ids || []).includes("ads");
        if (on !== !!state.blockNetworks) {
          state.blockNetworks = on;
          render();
        }
      });
    }
  });

  /* ---------- zdarzenia ---------- */

  el.enabled.addEventListener("change", () => update({ enabled: el.enabled.checked }));

  el.wide.addEventListener("change", () => update({ wide: el.wide.checked }));

  el.width.addEventListener("input", () => {
    update({ width: Number(el.width.value) });
  });

  el.fullWidth.addEventListener("change", () => {
    if (el.fullWidth.checked) {
      update({ width: 0 });
    } else {
      update({ width: Number(el.width.value) || 2000 });
    }
  });

  el.feedColumns.addEventListener("change", () => update({ feedColumns: el.feedColumns.checked }));

  el.readableText.addEventListener("change", () => update({ readableText: el.readableText.checked }));

  el.ads.addEventListener("change", () => update({ ads: el.ads.checked }));
  el.adNotes.addEventListener("change", () => update({ adNotes: el.adNotes.checked }));

  el.blockNetworks.addEventListener("change", () => {
    update({ blockNetworks: el.blockNetworks.checked });
    applyDnr(el.blockNetworks.checked);
  });

  el.extraCleanup.addEventListener("change", () => update({ extraCleanup: el.extraCleanup.checked }));

  el.extraSelectors.addEventListener("input", () => {
    const list = el.extraSelectors.value
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    update({ extraSelectors: list });
  });

  el.debug.addEventListener("change", () => update({ debug: el.debug.checked }));

  /* ---------- wygląd ---------- */

  el.pickBg.addEventListener("click", () => el.bgFile.click());

  el.bgFile.addEventListener("change", async () => {
    const file = el.bgFile.files && el.bgFile.files[0];
    el.bgFile.value = "";
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      status("To nie jest plik obrazu", "warn");
      return;
    }
    status("Przetwarzam obraz…");
    try {
      const data = await imageToDataUrl(file);
      bgData = data;
      render();
      chrome.storage.local.set({ [C.BG_KEY]: data }, () => {
        if (chrome.runtime.lastError) {
          status("Błąd zapisu tła: " + chrome.runtime.lastError.message, "warn");
        } else {
          status("Tło zapisane", "ok");
        }
      });
    } catch (e) {
      status(e.message || "Nie udało się wczytać obrazu", "warn");
    }
  });

  el.clearBg.addEventListener("click", () => {
    bgData = "";
    render();
    chrome.storage.local.remove(C.BG_KEY, () => status("Tło usunięte", "ok"));
  });

  $("openTab").addEventListener("click", () => {
    try {
      chrome.tabs.create({ url: chrome.runtime.getURL("src/popup.html") });
    } catch { /* ignore */ }
  });

  el.bgBlur.addEventListener("input", () => update({ bgBlur: Number(el.bgBlur.value) }));

  el.accent.addEventListener("input", () => update({ accent: el.accent.value }));

  el.accentReset.addEventListener("click", () => update({ accent: "" }));

  el.squareCorners.addEventListener("change", () => update({ squareCorners: el.squareCorners.checked }));

  /* szybkie przeładowanie wtyczki po podmianie plików */
  $("reloadExt").addEventListener("click", () => {
    setConn("Przeładowuję wtyczkę - potem odśwież stronę (Ctrl+Shift+R)", "ok");
    setTimeout(() => {
      try { chrome.runtime.reload(); } catch { /* ignore */ }
    }, 300);
  });
})();
