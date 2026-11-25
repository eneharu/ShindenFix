/*
 * ShindenFix - helper w świecie strony (world: "MAIN").
 *
 * Bramka przed playerami sprawdza `event.nativeEvent.isTrusted`, więc zwykłe
 * .click() jest ignorowane. Wywołujemy handlery Reacta bezpośrednio,
 * podstawiając atrapę zaufanego zdarzenia.
 */
(() => {
  if (window.__sfGateHelper) return;
  window.__sfGateHelper = true;
  document.documentElement.setAttribute("data-sf-gate-helper", "1");

  const propsOf = (el) => {
    const key = Object.getOwnPropertyNames(el).find((n) => n.startsWith("__reactProps$"));
    return key ? el[key] : null;
  };

  function findGateButton() {
    return [...document.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim().toLowerCase() === "pokaż playery"
    );
  }

  function bypass() {
    const btn = findGateButton();
    if (!btn) return false;

    const wrap = btn.parentElement;
    const checkbox = wrap ? wrap.querySelector("input[type='checkbox']") : null;
    const btnProps = propsOf(btn);
    if (!btnProps || typeof btnProps.onClick !== "function") return false;

    const fake = {
      nativeEvent: { isTrusted: true },
      target: btn,
      currentTarget: btn,
      preventDefault() {},
      stopPropagation() {}
    };

    if (checkbox) {
      const cbProps = propsOf(checkbox);
      if (cbProps && typeof cbProps.onChange === "function") {
        try {
          cbProps.onChange({
            nativeEvent: { isTrusted: true },
            target: { checked: true },
            currentTarget: checkbox,
            preventDefault() {},
            stopPropagation() {}
          });
        } catch { /* ignore */ }
      }
    }

    /* po onChange React przerenderowuje bramkę - bierzemy ŚWIEŻE propsy,
       inaczej onClick widzi stare `checked=false` i pokazuje błąd */
    setTimeout(() => {
      const freshBtn = findGateButton() || btn;
      const freshProps = propsOf(freshBtn) || btnProps;
      try { freshProps.onClick(fake); } catch { /* ignore */ }
    }, 80);

    return true;
  }

  document.addEventListener("sf:bypass-gate", () => bypass());

  /* ---------- ściana Ad-Shield ("Zezwól na reklamy…") ---------- */

  /*
   * Ad-Shield (html-load.com / error-report.com) potrafi podmienić stronę na
   * ekran "Zezwól na reklamy w tej witrynie" i wyczyścić <body>. Same pliki
   * blokuje reguła sieciowa (src/rules/adshield.json), a tutaj nie pozwalamy
   * stronie na przekierowanie do ściany i na skasowanie treści.
   */

  const WALL_HOST = /(^|\.)error-report\.com$/i;

  function isWallUrl(value) {
    try {
      return WALL_HOST.test(new URL(String(value), location.href).hostname);
    } catch {
      return false;
    }
  }

  function noteWall() {
    window.__sfWallBlocked = (Number(window.__sfWallBlocked) || 0) + 1;
  }

  /*
   * Ad-Shield po zablokowaniu swojego skryptu sama uruchamia atrybut
   * `onerror` z <script id="…" src="https://html-load.com/vendor.js">.
   * Ten atrybut to właśnie cała ściana. Przechwytujemy błąd w fazie capture
   * (przed atrybutem onerror) i nie pozwalamy mu się wykonać.
   */
  const AD_SCRIPT = /(html-load|css-load|js-load|content-loader|content-load)\.com\/|cloudfront\.net\/app\.js/i;

  function isAdshieldScript(el) {
    return el instanceof HTMLScriptElement && AD_SCRIPT.test(el.src || "");
  }

  try {
    const swallow = (event) => {
      if (!isAdshieldScript(event.target)) return;
      noteWall();
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener("error", swallow, true);
    document.addEventListener("load", swallow, true);
  } catch { /* ignore */ }

  try {
    const originalGetAttribute = Element.prototype.getAttribute;

    Object.defineProperty(Element.prototype, "getAttribute", {
      configurable: true,
      writable: true,
      value: function (name) {
        const key = String(name).toLowerCase();
        if ((key === "onerror" || key === "onload") && this instanceof HTMLScriptElement) {
          const src = originalGetAttribute.call(this, "src") || "";
          if (AD_SCRIPT.test(src) || this.hasAttribute("data-sdk")) return null;
        }
        return originalGetAttribute.call(this, name);
      }
    });
  } catch { /* ignore */ }

  /* Nawigacja przez location.href jest "unforgeable", ale Navigation API
     pozwala anulować przejście na stronę ściany. */
  try {
    if (window.navigation && typeof window.navigation.addEventListener === "function") {
      window.navigation.addEventListener("navigate", (event) => {
        if (isWallUrl(event.destination && event.destination.url)) {
          noteWall();
          event.preventDefault();
        }
      });
    }
  } catch { /* ignore */ }

  try {
    const originalOpen = window.open;
    window.open = function (url, ...rest) {
      if (isWallUrl(url)) { noteWall(); return null; }
      return originalOpen.call(window, url, ...rest);
    };
  } catch { /* ignore */ }

  /* ściana czyści stronę przez document.body.remove() i innerHTML = "" */
  try {
    const originalRemove = Element.prototype.remove;
    Object.defineProperty(Element.prototype, "remove", {
      configurable: true,
      writable: true,
      value: function () {
        if (this === document.body || this === document.documentElement) return;
        return originalRemove.call(this);
      }
    });
  } catch { /* ignore */ }

  try {
    const inner = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    if (inner && inner.set) {
      Object.defineProperty(Element.prototype, "innerHTML", {
        configurable: true,
        enumerable: inner.enumerable,
        get: inner.get,
        set(value) {
          if (value === "" && (this === document.body || this === document.documentElement)) return;
          inner.set.call(this, value);
        }
      });
    }
  } catch { /* ignore */ }

  /* okienko "Please allow ads…" nie ma się pokazywać */
  try {
    const originalConfirm = window.confirm;
    window.confirm = function (message) {
      if (typeof message === "string" && /please allow ads on this site/i.test(message)) return true;
      return originalConfirm.call(window, message);
    };
  } catch { /* ignore */ }
})();
