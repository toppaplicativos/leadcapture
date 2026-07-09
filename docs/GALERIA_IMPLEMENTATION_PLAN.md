# Galeria de Mídia — Plano de Implementação

> Documento de referência para retomar o trabalho caso a sessão caia.
> Última atualização: 2026-07-04

## Decisões confirmadas

- **Escopo fase 1:** imagens + vídeos (áudio/documento depois)
- **Rota dedicada:** `/galeria` — Criativos IA fica só para gerar
- **Pastas:** fixas do sistema + tags livres

## Progresso

- [x] Plano documentado
- [x] Fase 1 — Fundação (backend + página)
- [x] Fase 2 — MediaPickerModal + integrações (Campanhas, Instagram, Produtos)
- [x] Fase 3 parcial — tags inline, preview, upload drag-drop, mobile sidebar
- [ ] Fase 4 — áudio/documento, pastas custom, bulk delete, automações/fluxos

## Arquitetura

```
GaleriaPage → /api/gallery/* → GalleryService
                                    ├── media_files
                                    ├── creative_assets
                                    └── products (galeria)
```

## Pastas do sistema

| Slug | Label | Conteúdo |
|------|-------|----------|
| `ia` | Criativos IA | Assets gerados por IA |
| `uploads` | Uploads | Arquivos manuais |
| `campanhas` | Campanhas | `usedInCampaign = true` |
| `posts` | Posts | `usedInPost = true` |
| `produtos` | Produtos | Imagens de galeria de produtos |

## API `/api/gallery`

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/gallery` | Lista unificada |
| GET | `/api/gallery/folders` | Pastas + contadores |
| GET | `/api/gallery/:id` | Detalhe (`mf:`, `ca:`, `pg:`) |
| POST | `/api/gallery/upload` | Upload imagem/vídeo |
| POST | `/api/gallery/upload-multiple` | Upload em lote |
| PATCH | `/api/gallery/:id` | Tags, nome |
| DELETE | `/api/gallery/:id` | Soft-delete |
| POST | `/api/gallery/:id/use` | Registrar uso |
| GET | `/api/gallery/stats` | Totais |

## Arquivos

### Backend
- `src/services/gallery.ts`
- `src/routes/gallery.ts`
- `src/index.ts` (mount)

### Frontend
- `frontend/src/pages/GaleriaPage.tsx`
- `frontend/src/components/gallery/*`
- `frontend/src/lib/gallery/*`
- `frontend/src/routes/adminRoutes.tsx`
- `frontend/src/lib/admin/nav.ts`
- `frontend/src/pages/CriativosPage.tsx` (remover aba Galeria)

### Integrações
- `CampaignsView.tsx` — MediaPickerModal
- `InstagramPage.tsx` — MediaPickerModal
- `FacebookPage.tsx` — MediaPickerModal
- `ProductsView.tsx` — MediaPickerModal

## Design

- Register: **product** (Restrained)
- Referências: Linear, Notion, Figma Assets
- Tokens: `Button`, `Input`, `Card`, neutros DESIGN.md
- Sem gradientes violeta, sem card-grid clichê

## Critérios de aceite

- [x] `/galeria` no menu lateral
- [x] Lista IA + uploads + produtos
- [x] 5 pastas com contadores
- [x] Upload drag-and-drop
- [x] Filtros pasta/tipo/tags/busca
- [x] Preview com metadados
- [x] MediaPickerModal em Campanhas
- [x] Criativos redireciona para Galeria
- [x] Mobile responsivo (sidebar horizontal + preview sheet)
- [x] `npm run build` frontend OK

## Retomar implementação

1. Ler este arquivo e o diff em `src/services/gallery.ts`, `frontend/src/pages/GaleriaPage.tsx`
2. Rodar `npm run build` (backend) e `cd frontend && npm run build`
3. Próximos passos: Facebook (quando sair do placeholder), bulk select, automações