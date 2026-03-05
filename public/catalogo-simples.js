(function () {
  const params = new URLSearchParams(window.location.search);
  const slugFromQuery = (params.get("slug") || "").trim();
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const slugFromPath = pathParts.length > 1 && pathParts[0] === "catalogo" ? pathParts[1] : "";
  const storeSlug = slugFromQuery || slugFromPath;

  const state = {
    store: null,
    allProducts: [],
    bestSellers: [],
    otherProducts: [],
    categories: [],
    stats: { total_products: 0, total_orders: 0 },
    filterText: "",
    filterCategory: "",
    sortMode: "relevancia",
    cart: new Map(),
  };

  const el = {
    storeName: document.getElementById("storeName"),
    storeSubtitle: document.getElementById("storeSubtitle"),
    bestSellers: document.getElementById("bestSellers"),
    otherProducts: document.getElementById("otherProducts"),
    categoryFilter: document.getElementById("categoryFilter"),
    sortFilter: document.getElementById("sortFilter"),
    searchInput: document.getElementById("searchInput"),
    cartItems: document.getElementById("cartItems"),
    cartTotal: document.getElementById("cartTotal"),
    checkoutForm: document.getElementById("checkoutForm"),
    checkoutMessage: document.getElementById("checkoutMessage"),
    successSection: document.getElementById("conclusao"),
    successCard: document.getElementById("successCard"),
    trackForm: document.getElementById("trackForm"),
    trackResult: document.getElementById("trackResult"),
    statProducts: document.getElementById("statProducts"),
    statCategories: document.getElementById("statCategories"),
    statOrders: document.getElementById("statOrders"),
    scrollToProducts: document.getElementById("scrollToProducts"),
  };

  function money(value) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getProductById(id) {
    return state.allProducts.find((item) => String(item.id) === String(id)) || null;
  }

  function formatPhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function labelStatus(status) {
    const map = {
      novo: "Novo",
      confirmando_pagamento: "Confirmando pagamento",
      aprovado: "Aprovado",
      em_preparacao: "Em preparação",
      saiu_para_entrega: "Saiu para entrega",
      entregue: "Entregue",
      cancelado: "Cancelado",
    };
    const key = String(status || "").trim().toLowerCase();
    return map[key] || key || "-";
  }

  function getCartItems() {
    const items = [];
    for (const [productId, quantity] of state.cart.entries()) {
      const product = getProductById(productId);
      if (!product) continue;
      items.push({ product, quantity, lineTotal: Number(product.price || 0) * quantity });
    }
    return items;
  }

  function renderCart() {
    const items = getCartItems();
    if (items.length === 0) {
      el.cartItems.innerHTML = "<p>Seu carrinho está vazio.</p>";
      el.cartTotal.textContent = money(0);
      return;
    }

    let total = 0;
    el.cartItems.innerHTML = items
      .map(({ product, quantity, lineTotal }) => {
        total += lineTotal;
        return `
          <div class="cart-item">
            <div>
              <strong>${escapeHtml(product.name)}</strong><br />
              <small>${quantity} x ${money(product.price)}</small>
              <div class="cart-qty">
                <button class="qty-btn" type="button" data-cart-dec="${escapeHtml(product.id)}">-</button>
                <span class="qty-view">${quantity}</span>
                <button class="qty-btn" type="button" data-cart-inc="${escapeHtml(product.id)}">+</button>
              </div>
            </div>
            <div>
              <strong>${money(lineTotal)}</strong>
            </div>
          </div>
        `;
      })
      .join("");

    el.cartTotal.textContent = money(total);

    document.querySelectorAll("button[data-cart-inc]").forEach((button) => {
      button.addEventListener("click", () => changeCartQty(button.getAttribute("data-cart-inc"), +1));
    });

    document.querySelectorAll("button[data-cart-dec]").forEach((button) => {
      button.addEventListener("click", () => changeCartQty(button.getAttribute("data-cart-dec"), -1));
    });
  }

  function addToCart(productId) {
    const current = state.cart.get(productId) || 0;
    state.cart.set(productId, current + 1);
    renderCart();
  }

  function changeCartQty(productId, delta) {
    if (!productId) return;
    const current = Number(state.cart.get(productId) || 0);
    const next = current + delta;
    if (next <= 0) {
      state.cart.delete(productId);
    } else {
      state.cart.set(productId, next);
    }
    renderCart();
  }

  function productCard(item, showSold) {
    const sold = Number(item.sold_quantity || 0);
    const soldText = showSold ? `<p class="meta">Vendidos: ${sold}</p><span class="pill">Top venda</span>` : "";
    const description = item.description ? `<p class="meta">${escapeHtml(String(item.description).slice(0, 110))}</p>` : "";
    const qty = Number(state.cart.get(item.id) || 0);
    return `
      <article class="card">
        <img src="${escapeHtml(item.image || "")}" alt="${escapeHtml(item.name)}" onerror="this.style.display='none'" />
        <div class="card-body">
          <h4>${escapeHtml(item.name)}</h4>
          <p class="meta">${escapeHtml(item.category || "Outros")}</p>
          ${soldText}
          ${description}
          <div class="price">${money(item.price)}</div>
          <div class="card-actions">
            <button data-add="${escapeHtml(item.id)}">Adicionar</button>
            <button class="qty-btn" type="button" data-dec="${escapeHtml(item.id)}">-</button>
            <span class="qty-view">${qty}</span>
          </div>
        </div>
      </article>
    `;
  }

  function applyFilters(products) {
    const text = state.filterText.trim().toLowerCase();
    const category = state.filterCategory.trim().toLowerCase();

    return products.filter((item) => {
      const name = String(item.name || "").toLowerCase();
      const description = String(item.description || "").toLowerCase();
      const itemCategory = String(item.category || "").toLowerCase();
      const matchText = !text || name.includes(text) || description.includes(text);
      const matchCategory = !category || itemCategory === category;
      return matchText && matchCategory;
    });
  }

  function applySort(products) {
    const list = products.slice();
    if (state.sortMode === "menor_preco") {
      list.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
      return list;
    }

    if (state.sortMode === "maior_preco") {
      list.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
      return list;
    }

    if (state.sortMode === "nome") {
      list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
      return list;
    }

    return list;
  }

  function renderProducts() {
    el.bestSellers.innerHTML = state.bestSellers.map((item) => productCard(item, true)).join("");

    const filteredOthers = applySort(applyFilters(state.otherProducts));
    el.otherProducts.innerHTML =
      filteredOthers.length > 0
        ? filteredOthers.map((item) => productCard(item, false)).join("")
        : "<p>Nenhum produto encontrado para este filtro.</p>";

    document.querySelectorAll("button[data-add]").forEach((button) => {
      button.addEventListener("click", () => addToCart(button.getAttribute("data-add")));
    });

    document.querySelectorAll("button[data-dec]").forEach((button) => {
      button.addEventListener("click", () => changeCartQty(button.getAttribute("data-dec"), -1));
    });
  }

  function renderCategories() {
    const options = [
      '<option value="">Todas categorias</option>',
      ...state.categories.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)} (${item.count})</option>`),
    ];
    el.categoryFilter.innerHTML = options.join("");
  }

  async function loadCatalog() {
    if (!storeSlug) {
      el.storeSubtitle.textContent = "Informe o slug da loja na URL: /catalogo-simples.html?slug=sua-loja";
      return;
    }

    const response = await fetch(`/api/storefront/public/stores/${encodeURIComponent(storeSlug)}/catalog`);
    const data = await response.json();

    if (!response.ok || !data.success) {
      el.storeSubtitle.textContent = data.error || "Não foi possível carregar o catálogo.";
      return;
    }

    state.store = data.store;
    state.bestSellers = Array.isArray(data.best_sellers) ? data.best_sellers : [];
    state.otherProducts = Array.isArray(data.other_products) ? data.other_products : [];
    state.allProducts = Array.isArray(data.all_products) ? data.all_products : [];
    state.categories = Array.isArray(data.categories) ? data.categories : [];
    state.stats = {
      total_products: Number(data?.stats?.total_products || state.allProducts.length || 0),
      total_orders: Number(data?.stats?.total_orders || 0),
    };

    el.storeName.textContent = state.store?.name || "Sua Loja";
    el.storeSubtitle.textContent = "Escolha produtos, finalize o pedido e acompanhe o status em uma única página.";

    el.statProducts.textContent = String(state.stats.total_products || 0);
    el.statCategories.textContent = String(state.categories.length || 0);
    el.statOrders.textContent = String(state.stats.total_orders || 0);

    renderCategories();
    renderProducts();
    renderCart();
  }

  function renderSuccess(order, customerPhone) {
    const orderNumber = String(order?.order_number || "");
    const total = money(order?.total || 0);
    const paymentMethod = String(order?.payment_method || "não informado");
    const status = labelStatus(order?.status || "novo");

    el.successCard.innerHTML = `
      <div class="success-grid">
        <div>
          <p>Número do pedido</p>
          <strong>${escapeHtml(orderNumber)}</strong>
        </div>
        <div>
          <p>Status inicial</p>
          <strong>${escapeHtml(status)}</strong>
        </div>
        <div>
          <p>Total</p>
          <strong>${escapeHtml(total)}</strong>
        </div>
        <div>
          <p>Pagamento</p>
          <strong>${escapeHtml(paymentMethod)}</strong>
        </div>
      </div>
      <p>Pedido recebido com sucesso. Você pode acompanhar no bloco abaixo usando os mesmos dados.</p>
    `;

    el.successSection.classList.remove("hidden");
    el.successSection.scrollIntoView({ behavior: "smooth", block: "start" });

    const trackOrderField = el.trackForm.querySelector('input[name="order_number"]');
    const trackPhoneField = el.trackForm.querySelector('input[name="phone"]');
    if (trackOrderField) trackOrderField.value = orderNumber;
    if (trackPhoneField) trackPhoneField.value = String(customerPhone || "");
  }

  async function submitCheckout(event) {
    event.preventDefault();
    const form = new FormData(el.checkoutForm);
    const cartItems = getCartItems();

    if (!storeSlug) {
      el.checkoutMessage.textContent = "Slug da loja não informado.";
      return;
    }

    if (cartItems.length === 0) {
      el.checkoutMessage.textContent = "Adicione ao menos 1 produto antes de concluir.";
      return;
    }

    const orderPreference = String(form.get("order_preference") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    const address = String(form.get("address") || "").trim();
    const customerPhone = String(form.get("phone") || "").trim();

    const payload = {
      items: cartItems.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
      })),
      customer: {
        name: String(form.get("name") || "").trim(),
        phone: customerPhone,
        email: String(form.get("email") || "").trim() || undefined,
        address: {
          text: address || undefined,
          preference: orderPreference || undefined,
        },
      },
      payment_method: String(form.get("payment_method") || "").trim(),
      notes: [orderPreference ? `Preferência: ${orderPreference}` : "", notes].filter(Boolean).join(" | "),
    };

    el.checkoutMessage.textContent = "Processando pedido...";

    const response = await fetch(`/api/storefront/public/stores/${encodeURIComponent(storeSlug)}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      el.checkoutMessage.textContent = data.error || "Falha ao concluir pedido.";
      return;
    }

    const order = data?.order || {};
    const orderNumber = String(order.order_number || "");
    el.checkoutMessage.textContent = `Pedido ${orderNumber ? `#${orderNumber}` : ""} criado com sucesso.`;

    renderSuccess(order, customerPhone);

    state.cart.clear();
    renderCart();
    el.checkoutForm.reset();
  }

  async function submitTracking(event) {
    event.preventDefault();
    if (!storeSlug) return;

    const form = new FormData(el.trackForm);
    const orderNumber = String(form.get("order_number") || "").trim();
    const phone = formatPhone(form.get("phone") || "");

    if (!orderNumber || !phone) {
      el.trackResult.innerHTML = "<p>Informe número do pedido e telefone.</p>";
      return;
    }

    el.trackResult.innerHTML = "<p>Consultando pedido...</p>";

    const url = `/api/storefront/public/stores/${encodeURIComponent(storeSlug)}/orders/track?order_number=${encodeURIComponent(orderNumber)}&phone=${encodeURIComponent(phone)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !data.success) {
      el.trackResult.innerHTML = `<p>${escapeHtml(data.error || "Não foi possível consultar o pedido.")}</p>`;
      return;
    }

    const order = data.order || {};
    const timeline = Array.isArray(data.timeline) ? data.timeline : [];

    const timelineHtml = timeline.length
      ? timeline
          .map((item) => {
            const statusAfter = item.status_after ? ` → ${labelStatus(item.status_after)}` : "";
            return `
              <div class="timeline-item">
                <strong>${escapeHtml(item.event_type || "evento")}${escapeHtml(statusAfter)}</strong><br />
                <small>${escapeHtml(item.created_at || "")}</small>
                <p>${escapeHtml(item.actor_name || item.actor_type || "sistema")}</p>
              </div>
            `;
          })
          .join("")
      : "<p>Sem eventos de timeline ainda.</p>";

    el.trackResult.innerHTML = `
      <h4>Pedido ${escapeHtml(order.order_number || "")}</h4>
      <p>Status: <strong>${escapeHtml(labelStatus(order.status || ""))}</strong></p>
      <p>Total: <strong>${money(order.total)}</strong></p>
      <p>Pagamento: <strong>${escapeHtml(order.payment_method || "não informado")}</strong></p>
      <div>${timelineHtml}</div>
    `;
  }

  el.searchInput.addEventListener("input", (event) => {
    state.filterText = String(event.target.value || "");
    renderProducts();
  });

  el.categoryFilter.addEventListener("change", (event) => {
    state.filterCategory = String(event.target.value || "");
    renderProducts();
  });

  el.sortFilter.addEventListener("change", (event) => {
    state.sortMode = String(event.target.value || "relevancia");
    renderProducts();
  });

  el.scrollToProducts.addEventListener("click", () => {
    const target = document.getElementById("produtos");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  el.checkoutForm.addEventListener("submit", submitCheckout);
  el.trackForm.addEventListener("submit", submitTracking);

  loadCatalog().catch(() => {
    el.storeSubtitle.textContent = "Erro ao carregar catálogo.";
  });
})();
