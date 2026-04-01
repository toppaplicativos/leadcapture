/**
 * SHARED UI LOADER
 * Carrega componentes CSS do design system sob demanda.
 *
 * Uso: <script src="/shared/loader.js" data-components="topbar,bottom-nav,cards,forms,buttons,modal"></script>
 *
 * Componentes disponíveis:
 *   topbar, bottom-nav, cards, forms, buttons, modal, toast,
 *   badges, kpi, grid, splash, hero, checkout, sidebar, data-display, skeleton
 *
 * Sempre carrega: design-tokens.css, reset.css, layout.css
 */
(function () {
  var BASE = '/shared/';
  var COMP = BASE + 'components/';

  // Sempre carregar base
  var base = ['design-tokens.css', 'reset.css', 'layout.css'];

  // Ler componentes do atributo data-components
  var script = document.currentScript;
  var raw = (script && script.getAttribute('data-components')) || '';
  var components = raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);

  function injectCSS(href) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  // Injetar base
  base.forEach(function (file) { injectCSS(BASE + file); });

  // Injetar componentes
  components.forEach(function (name) { injectCSS(COMP + name + '.css'); });
})();
