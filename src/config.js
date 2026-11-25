/*
 * ShindenFix - konfiguracja
 *
 * Ten plik jest jedynym miejscem, w którym trzeba grzebać przy dodawaniu
 * nowych rzeczy do usuwania. Wszystko poniżej działa na KAŻDEJ podstronie
 * shinden.pl (skrypt jest wstrzykiwany globalnie).
 */
globalThis.SF = {
  /* Wersja schematu ustawień (migracje przy aktualizacjach) */
  SETTINGS_VERSION: 4,

  /* Domyślne ustawienia (nadpisywane z popupu / chrome.storage) */
  DEFAULTS: {
    version: 4,
    enabled: true,          // główny włącznik całej wtyczki
    wide: true,             // szerszy layout
    width: 2300,            // max szerokość treści w px; 0 = pełna szerokość okna
    feedColumns: true,      // kilka kolumn feedu na stronie głównej przy szerokim oknie
    readableText: true,     // ogranicza długość linii długich tekstów (newsy, opisy, posty)
    bgBlur: 8,              // rozmycie tła w px (samo tło trzymane jest osobno)
    accent: "",             // własny kolor akcentu (#rrggbb); puste = domyślny fiolet
    squareCorners: false,   // zamienia zaokrąglone rogi na kwadratowe
    ads: true,              // usuwanie reklam
    adNotes: true,          // usuwanie notek typu "na tej stronie jest tylko jedna reklama"
    extraCleanup: true,     // usuwanie własnych selektorów z popupu
    extraSelectors: [],     // lista selektorów CSS wpisanych w popupie
    blockNetworks: false,   // blokowanie sieci reklamowych (declarativeNetRequest)
    debug: false            // logowanie do konsoli
  },

  /*
   * Nazwy semantyczne z atrybutu data-sh-n na <html>.
   * Shinden nadaje klasom losowe/hashowane nazwy (np. "je9c86d"), ale trzyma
   * mapę "nazwa semantyczna -> hash" właśnie w data-sh-n. Dzięki temu nie
   * hardkodujemy hashy - po każdej zmianie wersji strony czytamy je na nowo.
   */
  AD_SEMANTIC: [
    "takie-tam",         // uniwersalny slot reklamowy
    "hp",                // boczny slot reklamowy (lewy/prawy) na szerokich ekranach
    "hp-r",
    "hp-rot",
    "hp-rot-r",
    "sh-side-ad",        // reklama w sidebarze
    "sh-promo",          // "autopromocja" / pasek promo na stronie głównej
    "sh-promo-custom",
    "main_custom_ad",
    "home-promo-ad",
    "home-promo-slider",
    "ep-ad-center"       // reklama na środku strony odcinka
  ],

  /* Notki/ostrzeżenia informacyjne o reklamach (osobny przełącznik) */
  NOTE_SEMANTIC: ["ep-ads-note"],

  /*
   * Sloty boczne („hp”) tylko ukrywamy, ale NIE usuwamy z DOM.
   * Shinden trzyma na nich ResizeObserver i wywala błąd w konsoli,
   * gdy element zniknie. Ukryty element jest niewidoczny i nie przeszkadza.
   */
  KEEP_SEMANTIC: ["hp", "hp-r", "hp-rot", "hp-rot-r"],

  /*
   * Selektory, które są stabilne (nie są hashowane) lub których hash zmienia
   * się rzadko. Działają niezależnie od data-sh-n.
   */
  AD_SELECTORS: [
    ".takie-tam",
    ".sh-side-ad",
    ".sh-promo",
    ".sh-promo-custom",
    ".main_custom_ad",
    ".home-promo-ad",
    ".home-promo-slider",
    ".ep-ad-center",
    ".ep-ads-note",
    "#ep-komunikat",

    /* reklamy "wyskakujące", które shinden dopina bezpośrednio do <html>/<body> */
    "html > div[style*='z-index: 2147483647']",
    "body > div[style*='z-index: 2147483647']",
    "html > div:has(> iframe[scrolling='no'])",

    /* kontenery sieci reklamowych / resztki po nich */
    ".spolecznoscinet",
    "[id^='spolecznosci-']",
    ".tTApContainer",
    ".tTApAd",
    "ins.adsbygoogle",
    "[id^='google_ads_']",
    "[id^='div-gpt-ad']",

    /* iframe'y reklamowe, które zdążyły się wstrzyknąć */
    "iframe[src*='criteo']",
    "iframe[src*='googlesyndication']",
    "iframe[src*='doubleclick']",
    "iframe[src*='spolecznosci']",
    "iframe[src*='adform']",
    "iframe[src*='adsystem']",
    "iframe[src*='taboola']",
    "iframe[src*='outbrain']",
    "img[src*='criteo']"
  ],

  /* Linki "sponsorowane" shindena - ich rodzica traktujemy jako kreację reklamową */
  SPONSORED_SELECTOR: "a[href^='/l/'][rel~='sponsored']",

  /* Dodatkowe reguły tekstowe: { text: RegExp, selector: string }
   * Usuwa element pasujący do "selector", którego tekst pasuje do "text".
   * Przykład:
   *   { text: /wspieraj nas/i, selector: ".box" }
   */
  TEXT_RULES: [],

  /*
   * Stałe elementy strony do usunięcia (nie są reklamami).
   * Działają zawsze, gdy wtyczka jest włączona.
   */
  REMOVE_SELECTORS: [
    "a.sh-side-chibi[href*='discord']",               // kafelek "Wbij na Discord" w prawym pasku
    "#rightSection a[href*='discord']",               // wariant dynamicznie doklejany (discord.com / discord.gg)
    "#rightSection img[src*='discord']",              // sama grafika, gdy link jest opakowany inaczej
    "#rightSection img[alt*='Discord']",              // ...albo po samym alt
    "#rightSection :is(.box, .sh-side-box):has(a[href*='discord'], img[src*='discord'], img[alt*='Discord'])",
    ".sh-tp-banner__bg",                              // rozmazane tło za nagłówkiem anime
    ".ep-ostrzezenie"                                 // "Nie otwieraj plików pobranych po kliknięciu w reklamę..."
  ],

  STORAGE_KEY: "shindenfix:settings",
  BG_KEY: "shindenfix:bg",
  MIRROR_KEY: "__shindenfix_settings"
};

/* Łączy zapisane ustawienia z domyślnymi + migracje między wersjami. */
globalThis.SF.normalize = function normalize(stored) {
  const src = stored || {};
  const s = Object.assign({}, globalThis.SF.DEFAULTS, src);
  const version = Number(src.version) || 1;

  /* v1 → v2: domyślne 2000 px zamieniamy na pełną szerokość */
  if (version < 2 && Number(src.width) === 2000) s.width = 0;
  /* v2 → v3: pełna szerokość → sprawdzone 2300 px */
  if (version < 3 && Number(s.width) === 0) s.width = 2300;

  s.version = globalThis.SF.SETTINGS_VERSION;
  return s;
};

