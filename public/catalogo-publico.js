(function () {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const query = new URLSearchParams(window.location.search);
  const isCustomDomain = !!window.__CUSTOM_DOMAIN__;
  const slugFromPath = (pathParts[0] === 'catalogo' || pathParts[0] === 'loja') && pathParts[1] ? pathParts[1] : '';
  const storeSlug = String(query.get('slug') || slugFromPath || window.__STORE_SLUG__ || '').trim();
  const productSlug = isCustomDomain ? (pathParts[1] || '') : (pathParts[3] || '');
  const basePath = isCustomDomain ? '' : (pathParts[0] === 'loja' ? 'loja' : 'catalogo');

  function storeUrl(subpath) {
    if (isCustomDomain) return subpath ? '/' + subpath : '/';
    return '/' + basePath + '/' + encodeURIComponent(storeSlug) + (subpath ? '/' + subpath : '');
  }

  const page = String(document.body.getAttribute('data-page') || '').trim();
  const cartKey = `sf_cart_${storeSlug}`;
  const customerKey = `sf_customer_${storeSlug}`;

  let _catalogProducts = [];

  function byId(id) { return document.getElementById(id); }
  function money(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0)); }
  function escapeHtml(v) { return String(v || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
  function normalizePhone(v) { return String(v || '').replace(/\D/g, ''); }
  function labelStatus(status) {
    const map = { novo: 'Novo', confirmando_pagamento: 'Confirmando pagamento', aprovado: 'Aprovado', em_preparacao: 'Em preparação', saiu_para_entrega: 'Saiu para entrega', entregue: 'Entregue', cancelado: 'Cancelado' };
    const key = String(status || '').trim().toLowerCase();
    return map[key] || key || '-';
  }
  function getCart() {
    try {
      const parsed = JSON.parse(localStorage.getItem(cartKey) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }
  function setCart(cart) {
    localStorage.setItem(cartKey, JSON.stringify(cart || {}));
    updateCartCount();
  }
  function addToCart(productId, qty) {
    if (!productId) return;
    const cart = getCart();
    const current = Number(cart[productId] || 0);
    const next = Math.max(0, current + Math.max(1, Number(qty || 1)));
    if (next <= 0) delete cart[productId]; else cart[productId] = next;
    setCart(cart);
  }
  function removeFromCart(productId) {
    const cart = getCart();
    delete cart[productId];
    setCart(cart);
  }
  function updateCartCount() {
    const cart = getCart();
    const total = Object.values(cart).reduce((sum, qty) => sum + Number(qty || 0), 0);
    const el = byId('cartCount');
    if (el) el.textContent = String(total);
  }
  function getCustomer() {
    try {
      const parsed = JSON.parse(localStorage.getItem(customerKey) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }
  function setCustomer(profile) { localStorage.setItem(customerKey, JSON.stringify(profile || {})); }

  /* ── Brand Colors ── */
  function applyBrandColors(brand, theme) {
    const primary = String(brand?.primary_color || theme?.primary_color || '#111827').trim();
    const secondary = String(brand?.secondary_color || theme?.secondary_color || '#3b82f6').trim();
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', primary);
    root.style.setProperty('--brand-secondary', secondary);
    root.style.setProperty('--brand-primary-light', primary + '0d');
    root.style.setProperty('--brand-secondary-light', secondary + '14');
  }

  /* ── Toast ── */
  let _toastTimer = null;
  function showToast(msg) {
    const el = byId('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* ── Tab Navigation (bottom nav) ── */
  function setupTabs() {
    const buttons = document.querySelectorAll('.bottom-nav-item[data-tab]');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        switchTab(tabId);
      });
    });
  }

  function switchTab(tabId) {
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.bottom-nav-item').forEach((b) => b.classList.remove('active'));
    const panel = byId(tabId);
    if (panel) panel.classList.add('active');
    const btn = document.querySelector(`.bottom-nav-item[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');
  }

  /* ── Modal ── */
  function openProductModal(product) {
    const overlay = byId('productModal');
    if (!overlay || !product) return;
    byId('modalImage').src = product.image || (product.images && product.images[0]) || '';
    byId('modalImage').alt = product.name || '';
    byId('modalImage').style.display = (product.image || (product.images && product.images[0])) ? '' : 'none';
    byId('modalName').textContent = product.name || 'Produto';
    byId('modalCategory').textContent = product.category_name || product.category || '';
    byId('modalDescription').textContent = product.description || 'Sem descrição disponível.';
    byId('modalPrice').textContent = money(product.price);
    const compare = byId('modalComparePrice');
    if (product.compare_at_price && Number(product.compare_at_price) > Number(product.price)) {
      compare.textContent = money(product.compare_at_price);
      compare.style.display = '';
    } else {
      compare.style.display = 'none';
    }

    /* Render extra detail rows */
    const detailsEl = byId('modalDetails');
    if (detailsEl) {
      const rows = [];
      if (product.sku) rows.push(['Código / SKU', product.sku]);
      if (product.weight) rows.push(['Peso', product.weight + (product.weight_unit ? ' ' + product.weight_unit : '')]);
      if (product.unit) rows.push(['Unidade', product.unit]);
      if (product.stock != null && product.stock !== '') rows.push(['Estoque', Number(product.stock) > 0 ? 'Disponível' : 'Indisponível']);
      detailsEl.innerHTML = rows.map(([label, value]) =>
        `<div class="modal-detail-row"><span class="modal-detail-label">${escapeHtml(label)}</span><span class="modal-detail-value">${escapeHtml(value)}</span></div>`
      ).join('');
    }

    byId('modalQty').value = '1';
    overlay._currentProduct = product;
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    updateModalSubtotal();
  }
  function closeProductModal() {
    const overlay = byId('productModal');
    if (!overlay) return;
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  function updateModalSubtotal() {
    const overlay = byId('productModal');
    const product = overlay && overlay._currentProduct;
    if (!product) return;
    const qty = Math.max(1, Number(byId('modalQty').value || 1));
    const subtotal = Number(product.price || 0) * qty;
    const el = byId('modalSubtotal');
    if (el) el.textContent = money(subtotal);
    const btn = byId('modalAddCart');
    if (btn) {
      const svgCart = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';
      btn.innerHTML = svgCart + ' Adicionar \u2022 ' + money(subtotal);
    }
  }

  function setupModal() {
    const overlay = byId('productModal');
    if (!overlay) return;
    byId('modalClose').addEventListener('click', closeProductModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeProductModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeProductModal(); });

    byId('qtyMinus').addEventListener('click', () => {
      const inp = byId('modalQty');
      inp.value = Math.max(1, Number(inp.value || 1) - 1);
      updateModalSubtotal();
    });
    byId('qtyPlus').addEventListener('click', () => {
      const inp = byId('modalQty');
      inp.value = Math.min(999, Number(inp.value || 1) + 1);
      updateModalSubtotal();
    });
    byId('modalQty').addEventListener('input', () => { updateModalSubtotal(); });
    byId('modalAddCart').addEventListener('click', () => {
      const p = overlay._currentProduct;
      if (!p) return;
      const qty = Math.max(1, Number(byId('modalQty').value || 1));
      addToCart(p.id, qty);
      closeProductModal();
      showToast(`${p.name} adicionado ao carrinho!`);
    });
  }

  /* ── SVG icons ── */
  const cartSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';

  async function fetchCatalog() {
    if (!storeSlug) throw new Error('Slug da loja não informado');
    const res = await fetch(`/api/storefront/public/stores/${encodeURIComponent(storeSlug)}/catalog`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao carregar catálogo');
    return data;
  }

  /* ── Category label cache ── */
  function categoryLabel(raw) {
    return String(raw || '').trim() || 'Outros';
  }

  /* ── Skeleton helpers ── */
  function hideSkeletons() {
    ['skeletonHero', 'skeletonInfoStrip', 'skeletonGrid'].forEach(function (id) {
      var el = byId(id);
      if (el) el.style.display = 'none';
    });
    ['heroBanner', 'storeInfoSection'].forEach(function (id) {
      var el = byId(id);
      if (el) el.style.display = '';
    });
  }

  async function renderHome() {
    const alert = byId('alert');
    try {
      const data = await fetchCatalog();
      hideSkeletons();
      const store = data.store || {};
      const brand = store.brand || {};
      const theme = store.theme || {};
      const profile = store.profile || {};

      applyBrandColors(brand, theme);

      document.title = (brand.name || store.name || 'Catálogo') + ' — Catálogo';
      const displayName = brand.name || store.name || 'Loja';
      const displaySlogan = brand.slogan || brand.description || 'Catálogo de produtos';
      byId('storeName').textContent = displayName;
      if (byId('heroName')) byId('heroName').textContent = displayName;
      if (byId('heroSlogan')) byId('heroSlogan').textContent = displaySlogan;
      if (byId('storeLogo')) {
        const logoUrl = brand.logo_url || theme.logo_url || '';
        if (logoUrl) {
          byId('storeLogo').src = logoUrl;
          byId('storeLogo').style.display = '';
          if (byId('storeAvatar')) byId('storeAvatar').style.display = 'none';
        } else {
          byId('storeLogo').style.display = 'none';
          if (byId('storeAvatar')) {
            byId('storeAvatar').textContent = (displayName || 'L').charAt(0);
            byId('storeAvatar').style.display = 'flex';
          }
        }
      }
      if (byId('heroLogo')) {
        const logoUrl = brand.logo_url || theme.logo_url || '';
        if (logoUrl) { byId('heroLogo').src = logoUrl; } else { byId('heroLogo').style.display = 'none'; }
      }
      if (byId('storeAddress')) byId('storeAddress').textContent = profile.address || brand.address || '—';
      if (byId('deliveryFee')) byId('deliveryFee').textContent = profile.delivery_fee != null ? money(profile.delivery_fee) : '—';
      if (byId('deliveryRadius')) byId('deliveryRadius').textContent = profile.delivery_radius_km != null ? `${Number(profile.delivery_radius_km)} km` : '—';
      if (byId('productCount')) byId('productCount').textContent = String((data.all_products || []).length || 0);
      if (byId('heroStatus')) {
        const isOpen = String(profile.status || 'aberto').toLowerCase() === 'aberto';
        byId('heroStatus').textContent = isOpen ? 'Aberto' : 'Fechado';
        byId('heroStatus').className = `hero-status ${isOpen ? 'open' : 'closed'}`;
      }
      if (byId('coverImage') && profile.cover_image) {
        byId('coverImage').src = profile.cover_image;
      }

      const products = Array.isArray(data.all_products) ? data.all_products : [];
      _catalogProducts = products;
      const list = byId('productsGrid');

      list.innerHTML = products.map((item) => {
        const imgSrc = item.image || (item.images && item.images[0]) || '';
        const catLabel = categoryLabel(item.category);
        const desc = String(item.description || '').slice(0, 90);
        const hasCompare = item.compare_at_price && Number(item.compare_at_price) > Number(item.price);
        return `
        <article class="card product" data-product-id="${escapeHtml(item.id)}">
          ${imgSrc ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.style.display='none'" />` : ''}
          <div class="product-body">
            <h3>${escapeHtml(item.name || 'Produto')}</h3>
            <span class="category-tag">${escapeHtml(catLabel)}</span>
            ${desc ? `<p class="description-preview">${escapeHtml(desc)}</p>` : ''}
            <div class="price-row">
              <span class="price">${money(item.price)}</span>
              ${hasCompare ? `<span class="compare-price">${money(item.compare_at_price)}</span>` : ''}
            </div>
            <button type="button" class="quick-add" data-add="${escapeHtml(item.id)}">${cartSvg} Adicionar</button>
          </div>
        </article>`;
      }).join('');

      /* Click on card → open modal */
      list.querySelectorAll('.product').forEach((card) => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.quick-add')) return;
          const pid = card.getAttribute('data-product-id');
          const prod = _catalogProducts.find((p) => p.id === pid);
          if (prod) openProductModal({ ...prod, category_name: categoryLabel(prod.category) });
        });
      });

      /* Quick add buttons */
      list.querySelectorAll('.quick-add').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const pid = btn.getAttribute('data-add');
          addToCart(pid, 1);
          const prod = _catalogProducts.find((p) => p.id === pid);
          showToast((prod ? prod.name : 'Produto') + ' adicionado!');
        });
      });
    } catch (err) {
      hideSkeletons();
      alert.textContent = String(err.message || err || 'Erro ao carregar loja.');
    }
  }

  async function renderProductPage() {
    const alert = byId('alert');
    if (!storeSlug || !productSlug) {
      alert.textContent = 'Produto não informado.';
      return;
    }

    const res = await fetch(`/api/storefront/public/stores/${encodeURIComponent(storeSlug)}/products/${encodeURIComponent(productSlug)}`);
    const data = await res.json();
    if (!res.ok || !data.success) {
      alert.textContent = data.error || 'Falha ao carregar produto';
      return;
    }

    const product = data.product || {};
    byId('productName').textContent = product.name || 'Produto';
    byId('productCategory').textContent = product.category || 'Outros';
    byId('productDescription').textContent = product.description || 'Sem descrição';
    byId('productPrice').textContent = money(product.price);

    const images = Array.isArray(product.images_json) ? product.images_json : (() => {
      try { return JSON.parse(product.images_json || '[]'); } catch { return []; }
    })();
    if (images[0] && byId('productImage')) byId('productImage').src = images[0];

    const addBtn = byId('addCurrentProduct');
    addBtn.addEventListener('click', () => {
      addToCart(product.id, Number(byId('productQty').value || 1));
      window.location.href = storeUrl('checkout');
    });
  }

  async function renderCheckoutPage() {
    const alertEl = byId('alert');
    const profile = getCustomer();
    if (byId('customerEmail')) byId('customerEmail').value = profile.email || '';
    if (byId('responsibleName')) byId('responsibleName').value = profile.responsible_name || profile.name || '';
    if (byId('establishmentName')) byId('establishmentName').value = profile.establishment_name || profile.establishment || '';
    if (byId('customerPhone')) byId('customerPhone').value = profile.phone || '';
    if (byId('customerAddress')) byId('customerAddress').value = profile.address || '';

    let data;
    try {
      data = await fetchCatalog();
    } catch (err) {
      if (alertEl) { alertEl.textContent = 'Erro ao carregar dados do catálogo.'; alertEl.className = 'alert-msg alert-error'; }
      return;
    }

    const store = data.store || {};
    const brand = store.brand || {};
    const theme = store.theme || {};
    applyBrandColors(brand, theme);

    const products = Array.isArray(data.all_products) ? data.all_products : [];
    const prodMap = new Map(products.map((p) => [String(p.id), p]));

    function renderCart() {
      const cart = getCart();
      const ids = Object.keys(cart).filter((k) => Number(cart[k]) > 0);
      const emptyEl = byId('emptyCart');
      const contentEl = byId('cartContent');

      if (ids.length === 0) {
        if (emptyEl) emptyEl.classList.remove('hidden');
        if (contentEl) contentEl.classList.add('hidden');
        return;
      }
      if (emptyEl) emptyEl.classList.add('hidden');
      if (contentEl) contentEl.classList.remove('hidden');

      let total = 0;
      const html = ids.map((id) => {
        const p = prodMap.get(String(id));
        if (!p) return '';
        const qty = Math.max(1, Number(cart[id] || 1));
        const line = Number(p.price || 0) * qty;
        total += line;
        const imgSrc = p.image || (p.images && p.images[0]) || '';
        return `
          <div class="ck-item">
            ${imgSrc
              ? `<img class="ck-item-img" src="${escapeHtml(imgSrc)}" alt="${escapeHtml(p.name)}" onerror="this.classList.add('ck-item-img--broken')" />`
              : `<div class="ck-item-img ck-item-img--placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`}
            <div class="ck-item-body">
              <h4 class="ck-item-name">${escapeHtml(p.name)}</h4>
              <span class="ck-item-unit">${money(p.price)} /un</span>
            </div>
            <div class="ck-item-actions">
              <div class="ck-qty">
                <button type="button" data-ck-qty="${escapeHtml(id)}" data-delta="-1">&minus;</button>
                <span>${qty}</span>
                <button type="button" data-ck-qty="${escapeHtml(id)}" data-delta="1">+</button>
              </div>
              <span class="ck-item-line">${money(line)}</span>
              <button type="button" class="ck-item-remove" data-ck-remove="${escapeHtml(id)}" aria-label="Remover">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>`;
      }).join('');

      byId('checkoutItems').innerHTML = html;
      if (byId('checkoutSubtotal')) byId('checkoutSubtotal').textContent = money(total);
      if (byId('checkoutTotal')) byId('checkoutTotal').textContent = money(total);
      if (byId('submitTotal')) byId('submitTotal').textContent = money(total);
      if (byId('itemCount')) byId('itemCount').textContent = String(ids.length);
      updateCartCount();

      byId('checkoutItems').querySelectorAll('[data-ck-qty]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const pid = btn.getAttribute('data-ck-qty');
          const delta = Number(btn.getAttribute('data-delta'));
          const c = getCart();
          const cur = Number(c[pid] || 1);
          const next = Math.max(1, cur + delta);
          c[pid] = next;
          setCart(c);
          renderCart();
        });
      });

      byId('checkoutItems').querySelectorAll('[data-ck-remove]').forEach((btn) => {
        btn.addEventListener('click', () => {
          removeFromCart(btn.getAttribute('data-ck-remove'));
          renderCart();
          showToast('Item removido');
        });
      });
    }

    renderCart();

    const form = byId('checkoutForm');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fd = new FormData(form);
      const email = String(fd.get('email') || '').trim().toLowerCase();
      const responsibleName = String(fd.get('responsible_name') || '').trim();
      const establishmentName = String(fd.get('establishment_name') || '').trim();
      const phone = String(fd.get('phone') || '').trim();
      const address = String(fd.get('address') || '').trim();
      const paymentMethod = String(fd.get('payment_method') || '').trim();
      const notes = String(fd.get('notes') || '').trim();

      if (!email || !responsibleName) {
        if (alertEl) { alertEl.textContent = 'Informe e-mail e nome do responsável.'; alertEl.className = 'alert-msg alert-error'; }
        return;
      }

      setCustomer({ email, responsible_name: responsibleName, establishment_name: establishmentName, phone, name: responsibleName, establishment: establishmentName, address });

      const latestCart = getCart();
      const items = Object.keys(latestCart).filter((id) => Number(latestCart[id]) > 0).map((id) => ({ product_id: id, quantity: Number(latestCart[id]) }));
      if (items.length === 0) {
        if (alertEl) alertEl.textContent = 'Carrinho vazio.';
        return;
      }

      const payload = {
        items,
        customer: {
          name: responsibleName || establishmentName,
          phone,
          email,
          address: { text: address || undefined, establishment_name: establishmentName || undefined },
        },
        payment_method: paymentMethod,
        notes: [establishmentName ? `Estabelecimento: ${establishmentName}` : '', notes].filter(Boolean).join(' | '),
      };

      const submitBtn = byId('submitBtn');
      if (submitBtn) { submitBtn.disabled = true; submitBtn.querySelector('span').textContent = 'Processando...'; }
      if (alertEl) { alertEl.textContent = ''; alertEl.className = 'alert-msg'; }

      try {
        const res = await fetch(`/api/storefront/public/stores/${encodeURIComponent(storeSlug)}/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await res.json();

        if (!res.ok || !result.success) {
          if (alertEl) { alertEl.textContent = result.error || 'Falha ao finalizar pedido'; alertEl.className = 'alert-msg alert-error'; }
          if (submitBtn) { submitBtn.disabled = false; submitBtn.querySelector('span').textContent = 'Finalizar pedido'; }
          return;
        }

        setCart({});
        const order = result.order || {};
        /* Persist customer_id so future visits are linked */
        if (order.customer_id) {
          setCustomer({ ...getCustomer(), customer_id: order.customer_id });
        }
        const checkoutUrl = String(result.checkout_url || '').trim();
        if (checkoutUrl) {
          window.location.href = checkoutUrl;
          return;
        }
        window.location.href = storeUrl('pedido') + `?order_number=${encodeURIComponent(order.order_number || '')}&phone=${encodeURIComponent(normalizePhone(phone))}`;
      } catch (err) {
        if (alertEl) { alertEl.textContent = 'Erro de conexão. Tente novamente.'; alertEl.className = 'alert-msg alert-error'; }
        if (submitBtn) { submitBtn.disabled = false; submitBtn.querySelector('span').textContent = 'Finalizar pedido'; }
      }
    });
  }

  async function renderOrderPage() {
    const orderForm = byId('orderTrackForm');
    const alert = byId('alert');
    const orderField = byId('orderNumber');
    const phoneField = byId('orderPhone');
    if (query.get('order_number')) orderField.value = query.get('order_number');
    if (query.get('phone')) phoneField.value = query.get('phone');

    orderForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const orderNumber = String(orderField.value || '').trim();
      const phone = normalizePhone(phoneField.value || '');
      if (!orderNumber || !phone) {
        alert.textContent = 'Informe número do pedido e telefone.';
        return;
      }

      alert.textContent = 'Consultando pedido...';
      const res = await fetch(`/api/storefront/public/stores/${encodeURIComponent(storeSlug)}/orders/track?order_number=${encodeURIComponent(orderNumber)}&phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert.textContent = data.error || 'Não foi possível consultar o pedido';
        return;
      }

      const order = data.order || {};
      const timeline = Array.isArray(data.timeline) ? data.timeline : [];
      byId('orderResult').innerHTML = `
        <div class="card">
          <h3>Pedido ${escapeHtml(order.order_number || '')}</h3>
          <p>Status: <strong>${escapeHtml(labelStatus(order.status || ''))}</strong></p>
          <p>Total: <strong>${money(order.total)}</strong></p>
          <p>Pagamento: <strong>${escapeHtml(order.payment_method || 'não informado')}</strong></p>
        </div>
        <div class="card" style="margin-top:10px;">
          <h4 style="margin-top:0">Timeline</h4>
          ${timeline.length ? timeline.map((item) => `<div class="order-item"><strong>${escapeHtml(item.event_type || 'evento')} ${item.status_after ? `→ ${escapeHtml(labelStatus(item.status_after))}` : ''}</strong><p class="muted">${escapeHtml(item.created_at || '')}</p></div>`).join('') : '<p>Sem eventos no momento.</p>'}
        </div>
      `;
      alert.textContent = '';
    });

    if (orderField.value && phoneField.value) {
      orderForm.dispatchEvent(new Event('submit'));
    }
  }

  async function renderHistoryPage() {
    const form = byId('historyForm');
    const alert = byId('alert');
    const profile = getCustomer();
    if (byId('histEmail')) byId('histEmail').value = profile.email || '';
    if (byId('histResponsible')) byId('histResponsible').value = profile.responsible_name || profile.name || '';
    if (byId('histEstablishment')) byId('histEstablishment').value = profile.establishment_name || profile.establishment || '';

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = String(byId('histEmail').value || '').trim().toLowerCase();
      const responsibleName = String(byId('histResponsible').value || '').trim();
      const establishmentName = String(byId('histEstablishment').value || '').trim();

      if (!email || !(responsibleName || establishmentName)) {
        alert.textContent = 'Informe e-mail e nome do responsável ou estabelecimento.';
        return;
      }

      setCustomer({
        ...getCustomer(),
        email,
        responsible_name: responsibleName,
        establishment_name: establishmentName,
      });

      alert.textContent = 'Carregando histórico...';
      const url = `/api/storefront/public/stores/${encodeURIComponent(storeSlug)}/orders/history?email=${encodeURIComponent(email)}&customer_name=${encodeURIComponent(responsibleName || establishmentName)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || !data.success) {
        alert.textContent = data.error || 'Não foi possível carregar histórico';
        return;
      }

      const orders = Array.isArray(data.orders) ? data.orders : [];
      byId('historyResult').innerHTML = orders.length ? orders.map((order) => {
        const items = Array.isArray(order.items) ? order.items : [];
        return `
          <article class="card" style="margin-top:10px;">
            <h3 style="margin:0">Pedido ${escapeHtml(order.order_number || '')}</h3>
            <p>Status: <strong>${escapeHtml(labelStatus(order.status || ''))}</strong></p>
            <p>Total: <strong>${money(order.total)}</strong></p>
            <p class="muted">Criado em: ${escapeHtml(order.created_at || '')}</p>
            <p><a class="btn secondary" href="${storeUrl('pedido')}?order_number=${encodeURIComponent(order.order_number || '')}&phone=${encodeURIComponent(normalizePhone(order.customer_phone || ''))}">Ver acompanhamento</a></p>
            <div class="list">${items.map((it) => `<div class="order-item"><strong>${escapeHtml(it.name || 'Item')}</strong><p>${Number(it.quantity || 1)} x ${money(it.unit_price || 0)}</p></div>`).join('')}</div>
          </article>
        `;
      }).join('') : '<p>Nenhum pedido encontrado para este cadastro.</p>';

      alert.textContent = '';
    });
  }

  /* ── Profile (registration) ── */
  function setupProfile() {
    const form = byId('profileForm');
    if (!form) return;
    const profile = getCustomer();
    if (byId('profileName')) byId('profileName').value = profile.name || profile.responsible_name || '';
    if (byId('profilePhone')) byId('profilePhone').value = profile.phone || '';
    if (byId('profileEmail')) byId('profileEmail').value = profile.email || '';
    if (byId('profileAddress')) byId('profileAddress').value = profile.address || '';
    if (byId('profileEstablishment')) byId('profileEstablishment').value = profile.establishment || profile.establishment_name || '';

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = String(byId('profileName').value || '').trim();
      const phone = String(byId('profilePhone').value || '').trim();
      const email = String(byId('profileEmail').value || '').trim().toLowerCase();
      const address = String(byId('profileAddress').value || '').trim();
      const establishment = String(byId('profileEstablishment').value || '').trim();
      const msg = byId('profileMsg');

      if (!name || !phone) {
        msg.textContent = 'Informe nome e telefone.';
        msg.className = 'profile-msg error';
        return;
      }

      setCustomer({
        name,
        responsible_name: name,
        phone,
        email,
        address,
        establishment,
        establishment_name: establishment,
      });
      msg.textContent = 'Cadastro salvo com sucesso!';
      msg.className = 'profile-msg';
      showToast('Cadastro salvo!');
    });
  }

  /* ── Pedidos search (inline tab) ── */
  function setupPedidosSearch() {
    const form = byId('pedidosSearchForm');
    if (!form) return;
    const profile = getCustomer();
    if (byId('pedidosEmail')) byId('pedidosEmail').value = profile.email || '';
    if (byId('pedidosPhone')) byId('pedidosPhone').value = profile.phone || '';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = String(byId('pedidosEmail').value || '').trim().toLowerCase();
      const phone = String(byId('pedidosPhone').value || '').trim();
      const resultEl = byId('pedidosResult');
      const infoEl = byId('pedidosInfo');

      if (!email && !phone) {
        infoEl.textContent = 'Informe e-mail ou telefone para buscar seus pedidos.';
        return;
      }

      infoEl.textContent = 'Buscando pedidos...';

      const customerName = getCustomer().name || getCustomer().responsible_name || '';
      const url = `/api/storefront/public/stores/${encodeURIComponent(storeSlug)}/orders/history?email=${encodeURIComponent(email)}&customer_name=${encodeURIComponent(customerName)}&phone=${encodeURIComponent(normalizePhone(phone))}`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok || !data.success) {
          infoEl.textContent = data.error || 'Não foi possível buscar pedidos.';
          return;
        }

        const orders = Array.isArray(data.orders) ? data.orders : [];
        if (orders.length === 0) {
          infoEl.textContent = 'Nenhum pedido encontrado.';
          resultEl.innerHTML = '';
          return;
        }

        infoEl.textContent = `${orders.length} pedido(s) encontrado(s).`;
        resultEl.innerHTML = orders.map((order) => {
          const items = Array.isArray(order.items) ? order.items : [];
          return `
            <article class="card">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                <h3 style="margin:0;font-size:15px">Pedido ${escapeHtml(order.order_number || '')}</h3>
                <span class="badge ${order.status === 'entregue' ? 'open' : 'closed'}" style="font-size:10px">${escapeHtml(labelStatus(order.status || ''))}</span>
              </div>
              <p style="margin-top:8px;font-size:13px;color:#64748b">Total: <strong style="color:#1e293b">${money(order.total)}</strong></p>
              ${items.length ? `<div class="list" style="margin-top:8px">${items.map((it) => `<div class="order-item"><strong>${escapeHtml(it.name || 'Item')}</strong><p>${Number(it.quantity || 1)} x ${money(it.unit_price || 0)}</p></div>`).join('')}</div>` : ''}
              <p style="margin-top:8px"><a class="btn-primary" style="display:inline-block;font-size:12px;padding:8px 14px;text-decoration:none" href="${storeUrl('pedido')}?order_number=${encodeURIComponent(order.order_number || '')}&phone=${encodeURIComponent(normalizePhone(order.customer_phone || ''))}">Acompanhar</a></p>
            </article>
          `;
        }).join('');
      } catch (err) {
        infoEl.textContent = 'Erro ao buscar pedidos.';
      }
    });
  }

  function hydrateNavLinks() {
    document.querySelectorAll('[data-link]').forEach((node) => {
      const to = String(node.getAttribute('data-link') || '').trim();
      if (!storeSlug) return;
      node.setAttribute('href', storeUrl(to));
    });
  }

  function boot() {
    if (!storeSlug) {
      const alert = byId('alert');
      if (alert) alert.textContent = 'Informe o slug da loja na URL, ex: /catalogo/minha-loja';
      return;
    }
    hydrateNavLinks();
    setupModal();
    setupTabs();
    setupProfile();
    setupPedidosSearch();
    updateCartCount();

    if (page === 'home') return renderHome().catch((err) => { byId('alert').textContent = String(err.message || err); });
    if (page === 'product') return renderProductPage().catch((err) => { byId('alert').textContent = String(err.message || err); });
    if (page === 'checkout') return renderCheckoutPage().catch((err) => { byId('alert').textContent = String(err.message || err); });
    if (page === 'order') return renderOrderPage().catch((err) => { byId('alert').textContent = String(err.message || err); });
    if (page === 'history') return renderHistoryPage().catch((err) => { byId('alert').textContent = String(err.message || err); });
  }

  boot();
})();
