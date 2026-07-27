/**
 * LeadCapture — Affiliate Tracker (sites externos)
 * ------------------------------------------------
 * Instale em qualquer site da organização (institucional, blog, landing).
 *
 * Uso mínimo:
 *   <script
 *     src="https://SEU-APP-LEADCAPTURE/lc-affiliate-tracker.js"
 *     data-api-base="https://SEU-APP-LEADCAPTURE"
 *     data-store-hosts="loja.exemplo.com,exemplo.online"
 *     defer></script>
 *
 * O que faz:
 * 1) Lê ?ref= e ?cupom= da URL
 * 2) POST /api/public/affiliate/:code (registra clique no SaaS)
 * 3) Grava cookie + localStorage no domínio atual
 * 4) Reescreve links para hosts da loja anexando ref/cupom (handoff de conversão)
 *
 * Qualquer organização: basta cadastrar o domínio em Afiliados → Domínios de rastreio
 * e colar este script no site (ou CMS).
 */
(function () {
  "use strict";

  var script =
    document.currentScript ||
    (function () {
      var list = document.getElementsByTagName("script");
      return list[list.length - 1];
    })();

  var API_BASE = String(
    (script && script.getAttribute("data-api-base")) ||
      (script && script.src ? script.src.replace(/\/lc-affiliate-tracker\.js(\?.*)?$/i, "") : "") ||
      ""
  ).replace(/\/$/, "");

  var STORE_HOSTS = String((script && script.getAttribute("data-store-hosts")) || "")
    .split(",")
    .map(function (h) {
      return h
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, "");
    })
    .filter(Boolean);

  var COOKIE_NAME = "lc_affiliate";
  var REF_KEY = "lc_affiliate_ref";
  var COUPON_KEY = "lc_affiliate_coupon";
  var ID_KEY = "lc_affiliate_id";
  var HAND_OFF_KEY = "lc_affiliate_store_handoff";

  function qs(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || "";
    } catch (e) {
      return "";
    }
  }

  function setCookie(name, value, days) {
    var maxAge = Math.max(1, Number(days) || 30) * 86400;
    document.cookie =
      name +
      "=" +
      encodeURIComponent(value) +
      "; path=/; max-age=" +
      maxAge +
      "; SameSite=Lax";
  }

  function storageSet(key, value) {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch (e) {}
    try {
      if (value) sessionStorage.setItem(key, value);
      else sessionStorage.removeItem(key);
    } catch (e) {}
  }

  function storageGet(key) {
    try {
      return sessionStorage.getItem(key) || localStorage.getItem(key) || "";
    } catch (e) {
      return "";
    }
  }

  function hostOf(url) {
    try {
      return new URL(url, window.location.href).hostname
        .toLowerCase()
        .replace(/^www\./, "");
    } catch (e) {
      return "";
    }
  }

  function isStoreHost(hostname) {
    var h = String(hostname || "")
      .toLowerCase()
      .replace(/^www\./, "");
    if (!h) return false;
    for (var i = 0; i < STORE_HOSTS.length; i++) {
      var s = STORE_HOSTS[i];
      if (h === s || h.endsWith("." + s)) return true;
    }
    return false;
  }

  function withAffiliateParams(href, ref, coupon) {
    if (!href || !ref) return href;
    try {
      var u = new URL(href, window.location.href);
      if (!isStoreHost(u.hostname)) return href;
      u.searchParams.set("ref", ref);
      if (coupon) u.searchParams.set("cupom", coupon);
      return u.toString();
    } catch (e) {
      return href;
    }
  }

  function decorateStoreLinks(ref, coupon) {
    if (!ref || !STORE_HOSTS.length) return;
    var anchors = document.querySelectorAll("a[href]");
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute("href");
      if (!href) continue;
      var next = withAffiliateParams(href, ref, coupon);
      if (next && next !== href) a.setAttribute("href", next);
    }
  }

  function observeLinks(ref, coupon) {
    if (!ref || typeof MutationObserver === "undefined") return;
    var obs = new MutationObserver(function () {
      decorateStoreLinks(ref, coupon);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  function capture() {
    if (!API_BASE) {
      console.warn("[lc-affiliate] data-api-base ausente");
      return;
    }

    var ref = String(qs("ref") || qs("a") || "").trim();
    var cupom = String(qs("cupom") || qs("coupon") || "").trim().toUpperCase();

    if (cupom) storageSet(COUPON_KEY, cupom);
    if (!ref) {
      // Sem ref na URL: ainda reescreve links se já houver sessão
      var existingRef = storageGet(REF_KEY);
      var existingCoupon = storageGet(COUPON_KEY);
      if (existingRef) {
        decorateStoreLinks(existingRef, existingCoupon);
        observeLinks(existingRef, existingCoupon);
      }
      return;
    }

    storageSet(REF_KEY, ref);

    var payload = {
      link_type: "support_site",
      landing_path: (window.location.pathname || "/") + (window.location.search || ""),
      source_host: window.location.hostname,
      source_domain: window.location.hostname,
    };

    fetch(API_BASE + "/api/public/affiliate/" + encodeURIComponent(ref), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit",
      mode: "cors",
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (res) {
        if (!res.ok || !res.data) return;
        var data = res.data;
        var coupon = String(data.coupon_code || cupom || "").trim().toUpperCase();
        var days = Number(data.cookie_days) || 30;
        if (data.affiliate_id) {
          storageSet(ID_KEY, String(data.affiliate_id));
          setCookie(COOKIE_NAME, String(data.affiliate_id), days);
        }
        if (coupon) storageSet(COUPON_KEY, coupon);
        if (data.store_handoff_url) storageSet(HAND_OFF_KEY, String(data.store_handoff_url));

        // Auto-detect store host from handoff / primary domain
        try {
          if (data.primary_domain) {
            var pd = String(data.primary_domain)
              .toLowerCase()
              .replace(/^www\./, "");
            if (pd && STORE_HOSTS.indexOf(pd) === -1) STORE_HOSTS.push(pd);
          }
          if (data.store_handoff_url) {
            var hh = hostOf(data.store_handoff_url);
            if (hh && STORE_HOSTS.indexOf(hh) === -1) STORE_HOSTS.push(hh);
          }
        } catch (e) {}

        decorateStoreLinks(ref, coupon);
        observeLinks(ref, coupon);

        // Exposto para o site host (opcional)
        window.__lcAffiliate = {
          ref: ref,
          coupon: coupon || null,
          affiliateId: data.affiliate_id || null,
          storeHandoffUrl: data.store_handoff_url || null,
        };
      })
      .catch(function (err) {
        console.warn("[lc-affiliate] falha no rastreio", err);
        // Mesmo offline, mantém ref local e tenta handoff em links
        decorateStoreLinks(ref, cupom);
        observeLinks(ref, cupom);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", capture);
  } else {
    capture();
  }
})();
