import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react'
import {
  Loader2, Handshake, Plus, ChevronRight, Wallet, Users, MousePointerClick, ExternalLink,
} from 'lucide-react'
import { PageSplash } from '@/components/PageSplash'
import { useToast } from '@/components/Toast'
import { fetchAffiliatesSnapshot } from '@/lib/affiliates/client'
import { useAffiliatesBridgeOptional, type AffiliatesTabKey } from '@/lib/agent/AffiliatesBridgeContext'
import { useAgentShell } from '@/lib/agent/AgentShellContext'
import { useIsDesktop } from '@/lib/hooks/useMediaQuery'
import { CatalogManagerSheet } from '@/components/agent/catalog/CatalogManagerSheet'

const AffiliatesManager = lazy(() =>
  import('@/pages/AffiliatesPage').then((m) => ({ default: m.AffiliatesPage })),
)

function AffiliatesManagerEmbedded({ initialTab }: { initialTab: AffiliatesTabKey }) {
  const { showToast } = useToast()
  return (
    <AffiliatesManager
      embedded
      initialTab={initialTab}
      showToast={(msg, tp) => showToast(tp === 'err' ? msg : msg, tp === 'err' ? 'error' : 'success')}
    />
  )
}

const TAB_CHIPS: { tab: AffiliatesTabKey; label: string }[] = [
  { tab: 'distribution', label: 'Distribuição' },
  { tab: 'programs', label: 'Programas' },
  { tab: 'partners', label: 'Afiliados' },
  { tab: 'commissions', label: 'Comissões' },
  { tab: 'payouts', label: 'Saques' },
  { tab: 'materials', label: 'Materiais' },
]

function fmtMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function AffiliatesInlinePanel() {
  const bridge = useAffiliatesBridgeOptional()
  const publishSnapshot = bridge?.publishSnapshot
  const registerHandlers = bridge?.registerHandlers
  const setModuleExpanded = bridge?.setModuleExpanded
  const { openCanvas, triggerSkill } = useAgentShell()
  const isDesktop = useIsDesktop()
  const snap = bridge?.snapshot
  const [managerOpen, setManagerOpen] = useState(false)
  const [managerTab, setManagerTab] = useState<AffiliatesTabKey>('overview')
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    publishSnapshot?.({ loading: true })
    try {
      const data = await fetchAffiliatesSnapshot()
      publishSnapshot?.({ ...data, loading: false })
    } catch {
      publishSnapshot?.({ loading: false })
    }
  }, [publishSnapshot])

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void load()
  }, [load])

  const openManager = useCallback((tab: AffiliatesTabKey = 'overview') => {
    setManagerTab(tab)
    publishSnapshot?.({ activeTab: tab })
    setModuleExpanded?.(true)
    if (isDesktop) {
      openCanvas('/afiliados')
    } else {
      setManagerOpen(true)
    }
  }, [isDesktop, openCanvas, publishSnapshot, setModuleExpanded])

  useEffect(() => {
    if (!registerHandlers) return
    return registerHandlers({
      openFull: () => openManager(snap?.activeTab || 'overview'),
      refresh: () => { void load() },
      openTab: (tab) => openManager(tab),
      createAffiliate: () => triggerSkill('affiliate.create', {
        label: 'Novo afiliado',
        assistantMessage: 'Vamos cadastrar um parceiro. Preencha os dados:',
      }),
      openSettings: () => openManager('programs'),
    })
  }, [registerHandlers, openManager, load, snap?.activeTab, triggerSkill])

  if (snap?.loading && !snap.affiliatesTotal) {
    return (
      <PageSplash variant="panel" label="Afiliados" />
    )
  }

  const activeTab = snap?.activeTab || 'overview'

  return (
    <div className={`catalog-panel catalog-panel--affiliates${managerOpen && !isDesktop ? ' catalog-panel--sheet-open' : ''}`}>
      <div className="catalog-affiliate-kpi-grid">
        <div className="catalog-affiliate-kpi">
          <Users size={12} className="text-teal-600" />
          <p className="catalog-affiliate-kpi__value tabular-nums">{snap?.affiliatesActive ?? 0}</p>
          <span className="catalog-affiliate-kpi__label">Ativos</span>
        </div>
        <div className="catalog-affiliate-kpi">
          <MousePointerClick size={12} className="text-sky-600" />
          <p className="catalog-affiliate-kpi__value tabular-nums">{snap?.totalClicks ?? 0}</p>
          <span className="catalog-affiliate-kpi__label">Cliques</span>
        </div>
        <div className="catalog-affiliate-kpi">
          <Wallet size={12} className="text-amber-600" />
          <p className="catalog-affiliate-kpi__value tabular-nums">{fmtMoney(snap?.commissionPending ?? 0)}</p>
          <span className="catalog-affiliate-kpi__label">Pendente</span>
        </div>
      </div>

      {snap?.topAffiliates && snap.topAffiliates.length > 0 && (
        <ul className="catalog-affiliate-partner-list">
          {snap.topAffiliates.slice(0, 4).map((a) => (
            <li key={a.id} className="catalog-affiliate-partner-item">
              <span className="catalog-affiliate-partner-item__name">{a.name}</span>
              <span className={`catalog-affiliate-partner-item__badge is-${a.status}`}>{a.status}</span>
              <span className="catalog-affiliate-partner-item__meta">{a.sales} vendas · {fmtMoney(a.commission)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="catalog-panel__filters">
        {TAB_CHIPS.map((chip) => (
          <button
            key={chip.tab}
            type="button"
            className={`catalog-panel__filter-chip catalog-panel__filter-chip--affiliate${activeTab === chip.tab ? ' is-active' : ''}`}
            onClick={() => openManager(chip.tab)}
          >
            {chip.label}
            {chip.tab === 'commissions' && (snap?.commissionsPendingCount ?? 0) > 0 && (
              <span className="catalog-panel__filter-badge">{snap?.commissionsPendingCount}</span>
            )}
            {chip.tab === 'payouts' && (snap?.payoutsRequested ?? 0) > 0 && (
              <span className="catalog-panel__filter-badge">{snap?.payoutsRequested}</span>
            )}
          </button>
        ))}
      </div>

      {isDesktop ? (
        <button type="button" className="catalog-panel__open-manager" onClick={() => openManager('overview')}>
          <Plus size={12} />
          Gestão completa no canvas
          <ChevronRight size={13} />
        </button>
      ) : (
        <>
          <div className="catalog-panel__toolbar catalog-panel__toolbar--tight">
            <button
              type="button"
              className="catalog-panel__action catalog-panel__action--ghost"
              onClick={() => triggerSkill('affiliate.create', { label: 'Novo afiliado', assistantMessage: 'Dados do parceiro:' })}
            >
              <Plus size={14} /> Novo parceiro
            </button>
            <button type="button" className="catalog-panel__action catalog-panel__action--ghost" onClick={() => openManager('overview')}>
              <ExternalLink size={14} /> Gestão completa
            </button>
          </div>
          <button type="button" className="catalog-panel__open-manager" onClick={() => openManager('overview')}>
            Abrir programa de afiliados
            <ChevronRight size={13} />
          </button>
          <CatalogManagerSheet
            open={managerOpen}
            onClose={() => setManagerOpen(false)}
            title="Afiliados"
            subtitle={snap?.enabled ? `${snap.affiliatesActive} ativo${snap.affiliatesActive !== 1 ? 's' : ''} · ${snap.commissionPct}%` : 'Programa desativado'}
          >
            <Suspense fallback={<PageSplash variant="panel" label="Afiliados" />}>
              <AffiliatesManagerEmbedded initialTab={managerTab} />
            </Suspense>
          </CatalogManagerSheet>
        </>
      )}

      {(snap?.affiliatesPending ?? 0) > 0 && (
        <button
          type="button"
          className="catalog-panel__filter-chip catalog-panel__filter-chip--affiliate catalog-panel__filter-chip--full"
          onClick={() => triggerSkill('affiliate.approve', { label: 'Aprovar pendentes', assistantMessage: 'Afiliados aguardando aprovação:' })}
        >
          {snap?.affiliatesPending} parceiro{snap?.affiliatesPending !== 1 ? 's' : ''} pendente{snap?.affiliatesPending !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}