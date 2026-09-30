/* seo.js — GigBridge statik sayfaları için ilerleyici geliştirmeler (defer, modülsüz).
   Sayfalar bu dosya OLMADAN da eksiksiz okunur ve gezilir; burada yalnız:
   1) açılır <details> menüleri (şehir, hamburger, mobil içindekiler): dışarı tık / Esc ile kapanma
   2) header şehir etiketi = SPA'nın seçili şehri (localStorage gb_city); şehir seçimi SPA ile paylaşılır
   3) SSS tek-açık akordeon yedeği (<details name> desteklemeyen tarayıcılar)
   4) İçindekiler scroll-spy (rehber + yasal metinler)
   5) İlçe semt haritası seçimi
   6) Hesap silme formu (mailto oluşturucu)
   7) Şehir sayfası "Bu hafta" etkinlikleri — boşta assets/seo-events.js (Firebase) yüklenir; veri yoksa bölüm gizli kalır */
(function () {
  "use strict";
  var d = document;
  var V = "20260929s";
  var $$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  d.documentElement.classList.add("gb-js");

  // ── 1) açılır menüler ──
  var pops = $$("details[data-gb-pop]");
  var isPopover = function (p) { return !p.classList.contains("gb-toc-m"); };
  pops.forEach(function (p) {
    p.addEventListener("toggle", function () {
      if (!p.open || !isPopover(p)) return;
      pops.forEach(function (o) { if (o !== p && o.open && isPopover(o)) o.open = false; });
    });
  });
  d.addEventListener("click", function (e) {
    var t = e.target;
    pops.forEach(function (p) {
      if (!p.open) return;
      var link = t.closest && t.closest("a");
      if (link && p.contains(link)) { p.open = false; return; }        // menüdeki bağlantı (aynı sayfa çapası dahil)
      if (isPopover(p) && !p.contains(t)) p.open = false;              // dışarı tık
    });
  });
  d.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    pops.forEach(function (p) {
      if (!p.open || !isPopover(p)) return;
      var hadFocus = p.contains(d.activeElement);
      p.open = false;
      if (hadFocus) { var s = p.querySelector("summary"); if (s) s.focus(); }
    });
  });

  // ── 2) şehir etiketi / seçimi ──
  var cityBox = d.querySelector("[data-gb-city]");
  if (cityBox && !cityBox.querySelector(".gb-city-opt[aria-current]")) {
    var saved = null;
    try { saved = localStorage.getItem("gb_city"); } catch (_) { saved = null; }
    if (saved && saved !== "TÜMÜ" && saved.length <= 40) {
      var lab = cityBox.querySelector(".gb-city-l");
      if (lab) lab.textContent = saved;
      var sum = cityBox.querySelector("summary");
      if (sum) sum.setAttribute("aria-label", "Şehir seç, şu an " + saved);
    }
  }
  $$(".gb-city-opt[data-city], .gb-menu-city[data-city]").forEach(function (a) {
    a.addEventListener("click", function () { try { localStorage.setItem("gb_city", a.getAttribute("data-city")); } catch (_) { /* depolama kapalı */ } });
  });

  // ── 3) SSS tek-açık yedeği ──
  if (!("name" in HTMLDetailsElement.prototype)) {
    $$("details[name]").forEach(function (dt) {
      dt.addEventListener("toggle", function () {
        if (!dt.open) return;
        $$('details[name="' + dt.getAttribute("name") + '"]').forEach(function (o) { if (o !== dt) o.open = false; });
      });
    });
  }

  // ── 4) İçindekiler scroll-spy ──
  $$("[data-gb-toc]").forEach(function (toc) {
    var links = $$("a[href^='#']", toc);
    var byId = {};
    var targets = links.map(function (a) {
      var id = decodeURIComponent(a.getAttribute("href").slice(1));
      var el = d.getElementById(id);
      if (el) byId[id] = a;
      return el;
    }).filter(Boolean);
    if (!targets.length || !("IntersectionObserver" in window)) return;
    var scroller = toc.closest(".gb-ltoc-aside");
    var current = null;
    function setActive(id) {
      if (!byId[id] || id === current) return;
      current = id;
      links.forEach(function (a) {
        var on = byId[id] === a;
        a.classList.toggle("is-on", on);
        if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      });
      // yapışkan, kendi içinde kayan kenar çubuğunda etkin öğeyi görünür tut (sayfayı kaydırmadan)
      if (scroller && scroller.scrollHeight > scroller.clientHeight + 2) {
        var a = byId[id], r = a.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
        if (r.top < sr.top + 8) scroller.scrollTop -= sr.top + 8 - r.top;
        else if (r.bottom > sr.bottom - 8) scroller.scrollTop += r.bottom - sr.bottom + 8;
      }
    }
    var vis = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { vis[en.target.id] = en.isIntersecting; });
      for (var i = 0; i < targets.length; i++) { if (vis[targets[i].id]) { setActive(targets[i].id); return; } }
    }, { rootMargin: "-30% 0px -60% 0px" });
    targets.forEach(function (t) { io.observe(t); });
    // Uçlar: sayfa sonunda son bölüm banda hiç girmeyebilir → en alttaysa sonuncuyu; ilk bölümün üstündeyken
    // (bant boşken önceki seçim takılı kalmasın) ilkini işaretle.
    var edges = function () {
      var doc = d.documentElement;
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 4) setActive(targets[targets.length - 1].id);
      else if (targets[0].getBoundingClientRect().top > window.innerHeight * 0.4) setActive(targets[0].id);
    };
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; edges(); });
    }, { passive: true });
    edges();
    links.forEach(function (a) { a.addEventListener("click", function () { setActive(decodeURIComponent(a.getAttribute("href").slice(1))); }); });
  });

  // ── 5) İlçe semt haritası ──
  $$("[data-gb-semts]").forEach(function (sec) {
    var legend = sec.querySelector("[data-gb-legend]");
    function select(id) {
      $$("[data-gb-semt]", sec).forEach(function (b) {
        var on = b.getAttribute("data-gb-semt") === id;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      $$("[data-gb-pin-l]", sec).forEach(function (l) { l.classList.toggle("is-on", l.getAttribute("data-gb-pin-l") === id); });
      var name = sec.querySelector('.gb-semt-btn[data-gb-semt="' + id + '"] .gb-semt-name');
      if (legend && name) legend.textContent = name.textContent;
    }
    sec.addEventListener("click", function (e) { var b = e.target.closest("[data-gb-semt]"); if (b) select(b.getAttribute("data-gb-semt")); });
    $$("[data-gb-semt-link]").forEach(function (a) { a.addEventListener("click", function () { select(a.getAttribute("data-gb-semt-link")); }); });
  });

  // ── 6) Hesap silme formu ──
  var del = d.querySelector("[data-gb-del]");
  if (del) {
    var form = del.querySelector("[data-gb-del-form]");
    var ok = del.querySelector("[data-gb-del-ok]");
    var email = form.querySelector("[data-gb-email]");
    var nameI = form.querySelector("[data-gb-name]");
    var agree = form.querySelector("[data-gb-agree]");
    var box = form.querySelector("[data-gb-email-box]");
    var err = form.querySelector("[data-gb-email-err]");
    var btn = form.querySelector("[data-gb-del-submit]");
    var RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var tried = false;
    form.noValidate = true;                     // JS varken tasarımın hata durumu; JS yokken tarayıcı doğrulaması + mailto form
    var valid = function () { return RE.test(email.value.trim()); };
    var sync = function () {
      var ready = valid() && agree.checked;
      btn.setAttribute("aria-disabled", ready ? "false" : "true");
      var show = tried && !valid();
      box.classList.toggle("is-err", show);
      email.setAttribute("aria-invalid", show ? "true" : "false");
      var msg = show ? "Geçerli bir e-posta adresi girin." : "";
      if (err.textContent !== msg) err.textContent = msg;
    };
    email.addEventListener("input", sync);
    agree.addEventListener("change", sync);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!(valid() && agree.checked)) { tried = true; sync(); (valid() ? agree : email).focus(); return; }
      var em = email.value.trim(), nm = nameI.value.trim();
      var href = "mailto:gigbridge.tr@gmail.com?subject=" + encodeURIComponent("Hesap Silme Talebi")
        + "&body=" + encodeURIComponent("Kayıtlı e-posta: " + em + "\nGörünen ad: " + (nm || "—"));
      tried = false;
      ok.querySelector("[data-gb-del-ok-email]").textContent = em;
      form.hidden = true;
      ok.hidden = false;
      var h = ok.querySelector("[data-gb-del-ok-h]");
      if (h) h.focus();
      window.location.href = href;              // kullanıcının e-posta uygulaması açılır; sayfa hiçbir şey göndermez
    });
    ok.querySelector("[data-gb-del-reset]").addEventListener("click", function () {
      agree.checked = false;
      ok.hidden = true;
      form.hidden = false;
      sync();
      email.focus();
    });
    sync();
  }

  // ── 7) şehir sayfası: bölüm numaralarını görünür bölümlere göre yenile + "Bu hafta" verisi ──
  window.__gbRenumber = function () {
    var n = 0;
    $$("[data-gb-num]").forEach(function (k) {
      var sec = k.closest("section");
      if (sec && sec.hidden) return;
      n += 1;
      k.textContent = (n < 10 ? "0" : "") + n + " · " + k.getAttribute("data-gb-num");
    });
  };
  // Yerel geliştirmede (localhost/127.0.0.1) Firebase YALNIZ emülatör modunda yüklenir (?emu ya da aynı sekmede
  // sessionStorage gb_emu=1 — js/firebase.js ile aynı kural). Aksi hâlde js/firebase.js üretim projesine bağlanırdı.
  var localDev = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  var emuOn = false;
  try { emuOn = /[?&]emu(=|&|$)/.test(location.search) || sessionStorage.getItem("gb_emu") === "1"; } catch (_) { emuOn = false; }
  if (d.querySelector("[data-gb-events]") && (!localDev || emuOn)) {
    var load = function () {
      var s = d.createElement("script");
      s.type = "module";
      s.src = "/assets/seo-events.js?v=" + V;
      d.head.appendChild(s);
    };
    if ("requestIdleCallback" in window) window.requestIdleCallback(load, { timeout: 2500 });
    else window.setTimeout(load, 600);
  }
})();
