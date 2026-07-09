export type AutomationFrequency =
  | 'every_5min' | 'every_15min' | 'every_30min'
  | 'hourly' | 'every_2h' | 'every_6h' | 'every_12h'
  | 'daily' | 'weekly' | 'monthly'

export type InstagramAutomationItem = {
  slug: string
  name: string
  description: string
  category: string
  task_type: string
  default_frequency: AutomationFrequency
  default_cron?: string
  default_config: Record<string, any>
  is_squad?: boolean
  execution_steps?: string[]
  icon?: string
  is_implemented?: boolean
  state: null | {
    id: string
    status: 'active' | 'paused' | 'error' | 'disabled'
    frequency: AutomationFrequency
    cron_expression: string | null
    config: Record<string, any>
    next_run_at: string | null
    last_run_at: string | null
    last_run_status: string | null
    last_run_duration_ms: number | null
    last_error: string | null
    run_count: number
    success_count: number
    error_count: number
  }
}

export const IG_TYPE_LABELS: Record<string, string> = {
  'squad:social-post': 'Post Squad',
  'instagram:performance-report': 'Relatorio',
  'instagram:mention-monitor': 'Mencoes',
  'instagram:auto-reply': 'Auto Reply',
  'instagram:hashtag-research': 'Hashtags',
  'instagram:story-publisher': 'Stories',
  'instagram:profile-health': 'Saude',
}

export const IG_TYPE_COLORS: Record<string, string> = {
  'squad:social-post': 'bg-purple-100 text-purple-700',
  'instagram:performance-report': 'bg-indigo-100 text-indigo-700',
  'instagram:mention-monitor': 'bg-amber-100 text-amber-700',
  'instagram:auto-reply': 'bg-sky-100 text-sky-700',
  'instagram:hashtag-research': 'bg-emerald-100 text-emerald-700',
  'instagram:story-publisher': 'bg-pink-100 text-pink-700',
  'instagram:profile-health': 'bg-gray-100 text-gray-700',
}

export function isInstagramAutomation(item: InstagramAutomationItem): boolean {
  if (item.task_type.startsWith('instagram:')) return true
  if (item.default_config?.platform === 'instagram') return true
  return false
}

export function humanizeCron(cron: string | null | undefined, fallback: string): string {
  if (!cron) return fallback
  const map: Record<string, string> = {
    '0 8 * * 1': 'Seg as 8h',
    '0 19 * * 5': 'Sex as 19h',
    '0 18 * * 1,3,5': 'Seg/Qua/Sex as 18h',
    '0 */3 * * *': 'A cada 3h',
    '0 */4 * * *': 'A cada 4h',
    '0 9 * * 1-5': 'Seg-Sex as 9h',
    '0 12 * * 2,4': 'Ter/Qui as 12h',
    '0 8 * * 3': 'Qua as 8h',
    '0 11 * * *': 'Diario as 11h',
    '0 23 * * *': 'Diario as 23h',
  }
  return map[cron] || cron
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) {
    const future = -diff
    if (future < 3600_000) return `em ${Math.round(future / 60_000)} min`
    if (future < 86400_000) return `em ${Math.round(future / 3600_000)}h`
    return `em ${Math.round(future / 86400_000)}d`
  }
  if (diff < 3600_000) return `ha ${Math.round(diff / 60_000)} min`
  if (diff < 86400_000) return `ha ${Math.round(diff / 3600_000)}h`
  return `ha ${Math.round(diff / 86400_000)}d`
}

export function successRate(item: InstagramAutomationItem): number {
  const runs = Number(item.state?.run_count || 0)
  const ok = Number(item.state?.success_count || 0)
  if (!runs) return 0
  return Math.round((ok / runs) * 100)
}