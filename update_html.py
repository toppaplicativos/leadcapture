#!/usr/bin/env python3
import re

with open('/root/lead-system/public/index.html', 'r') as f:
    html = f.read()

# Remove any previous partial products insertion
html = re.sub(r'\s*<li data-tab="products">.*?</li>', '', html, flags=re.DOTALL)

# 1. Add sidebar nav item after Campanhas
sidebar_item = """
                <li data-tab="products">
                    <i class="fas fa-tags"></i>
                    <span>Produtos</span>
                </li>"""

# Find the closing </li> of campaigns
campaigns_pattern = r'(<li data-tab="campaigns">\s*<i class="fas fa-paper-plane"></i>\s*<span>Campanhas</span>\s*</li>)'
html = re.sub(campaigns_pattern, r'\1' + sidebar_item, html)

# 2. Add Products tab content + modals before </main>
products_tab = """
            <!-- Products Tab -->
            <div id="products" class="tab-content">
                <div class="tab-header">
                    <h1>Produtos &amp; Precos</h1>
                </div>

                <div class="products-subtabs" style="display:flex;gap:12px;margin-bottom:24px;">
                    <button class="btn btn-primary products-subtab active" data-subtab="categories-panel" onclick="switchProductSubtab(this)">
                        <i class="fas fa-folder"></i> Categorias
                    </button>
                    <button class="btn btn-secondary products-subtab" data-subtab="products-panel" onclick="switchProductSubtab(this)">
                        <i class="fas fa-box"></i> Produtos
                    </button>
                    <button class="btn btn-secondary products-subtab" data-subtab="pricetables-panel" onclick="switchProductSubtab(this)">
                        <i class="fas fa-table"></i> Tabelas de Preco
                    </button>
                </div>

                <div id="categories-panel" class="products-panel active">
                    <div class="card">
                        <div class="tab-header">
                            <h2>Categorias</h2>
                            <button class="btn btn-primary btn-sm" onclick="openCategoryModal()">
                                <i class="fas fa-plus"></i> Nova Categoria
                            </button>
                        </div>
                        <div id="categories-list"></div>
                    </div>
                </div>

                <div id="products-panel" class="products-panel" style="display:none;">
                    <div class="card">
                        <div class="tab-header">
                            <h2>Produtos</h2>
                            <button class="btn btn-primary btn-sm" onclick="openProductModal()">
                                <i class="fas fa-plus"></i> Novo Produto
                            </button>
                        </div>
                        <div id="products-list"></div>
                    </div>
                </div>

                <div id="pricetables-panel" class="products-panel" style="display:none;">
                    <div class="card">
                        <div class="tab-header">
                            <h2>Tabelas de Preco</h2>
                            <button class="btn btn-primary btn-sm" onclick="openPriceTableModal()">
                                <i class="fas fa-plus"></i> Nova Tabela
                            </button>
                        </div>
                        <div id="pricetables-list"></div>
                    </div>
                </div>
            </div>

            <!-- Category Modal -->
            <div id="category-modal" class="modal hidden">
                <div class="modal-content" style="text-align:left;max-width:450px;">
                    <h2 id="category-modal-title">Nova Categoria</h2>
                    <input type="hidden" id="category-edit-id">
                    <div class="form-group">
                        <label>Nome</label>
                        <input type="text" id="category-name" placeholder="Ex: Tatuagens, Piercings...">
                    </div>
                    <div class="form-group">
                        <label>Descricao</label>
                        <textarea id="category-description" rows="2" placeholder="Descricao da categoria..."></textarea>
                    </div>
                    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
                        <button class="btn btn-secondary" onclick="closeCategoryModal()">Cancelar</button>
                        <button class="btn btn-primary" onclick="saveCategory()">Salvar</button>
                    </div>
                </div>
            </div>

            <!-- Product Modal -->
            <div id="product-modal" class="modal hidden">
                <div class="modal-content" style="text-align:left;max-width:500px;">
                    <h2 id="product-modal-title">Novo Produto</h2>
                    <input type="hidden" id="product-edit-id">
                    <div class="form-group">
                        <label>Nome</label>
                        <input type="text" id="product-name" placeholder="Ex: Tatuagem Pequena...">
                    </div>
                    <div class="form-group">
                        <label>Descricao</label>
                        <textarea id="product-description" rows="2" placeholder="Descricao do produto..."></textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Categoria</label>
                            <select id="product-category"></select>
                        </div>
                        <div class="form-group">
                            <label>Preco Base (R$)</label>
                            <input type="number" id="product-baseprice" step="0.01" min="0" placeholder="0.00">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Unidade</label>
                        <input type="text" id="product-unit" placeholder="Ex: unidade, hora, sessao..." value="unidade">
                    </div>
                    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
                        <button class="btn btn-secondary" onclick="closeProductModal()">Cancelar</button>
                        <button class="btn btn-primary" onclick="saveProduct()">Salvar</button>
                    </div>
                </div>
            </div>

            <!-- Price Table Modal -->
            <div id="pricetable-modal" class="modal hidden">
                <div class="modal-content" style="text-align:left;max-width:600px;max-height:80vh;overflow-y:auto;">
                    <h2 id="pricetable-modal-title">Nova Tabela de Preco</h2>
                    <input type="hidden" id="pricetable-edit-id">
                    <div class="form-group">
                        <label>Nome da Tabela</label>
                        <input type="text" id="pricetable-name" placeholder="Ex: Tabela Promocional Verao...">
                    </div>
                    <div class="form-group">
                        <label>Descricao</label>
                        <textarea id="pricetable-desc" rows="2" placeholder="Descricao da tabela..."></textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Validade Inicio</label>
                            <input type="date" id="pricetable-start">
                        </div>
                        <div class="form-group">
                            <label>Validade Fim</label>
                            <input type="date" id="pricetable-end">
                        </div>
                    </div>
                    <hr style="border-color:#2a2a4a;margin:16px 0;">
                    <h2 style="margin-bottom:12px;">Produtos &amp; Precos</h2>
                    <div id="pricetable-entries"></div>
                    <button class="btn btn-secondary btn-sm" onclick="addPriceEntry()" style="margin-top:8px;">
                        <i class="fas fa-plus"></i> Adicionar Produto
                    </button>
                    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
                        <button class="btn btn-secondary" onclick="closePriceTableModal()">Cancelar</button>
                        <button class="btn btn-primary" onclick="savePriceTable()">Salvar</button>
                    </div>
                </div>
            </div>
"""

# Remove any previous products tab content
html = re.sub(r'\s*<!-- Products Tab -->.*?<!-- End Products -->', '', html, flags=re.DOTALL)

# Insert before </main>
html = html.replace('        </main>', products_tab + '\n        </main>')

with open('/root/lead-system/public/index.html', 'w') as f:
    f.write(html)

print('HTML updated successfully!')
