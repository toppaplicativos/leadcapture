import { useCallback, useState } from 'react'
import { Users } from 'lucide-react'
import type { AppContext } from '@/pages/affiliate/types'
import { AffiliateOpportunitiesPanel } from '@/pages/affiliate/AffiliateOpportunitiesPanel'
import {
  AffiliateAttendanceWorkspace,
  type AttendanceOpportunity,
} from '@/pages/affiliate/AffiliateAttendanceWorkspace'
import {
  AffiliateTaskWorkspace,
  type AttendanceTaskItem,
} from '@/pages/affiliate/AffiliateTaskWorkspace'
import { affiliateApi } from '@/lib/api-affiliate'
import { formatCountdown, formatDueAt, isTaskDue } from '@/lib/affiliate-contact-ops'
import type { ProgressPatch } from '@/lib/affiliate-crm-local'

export function AffiliateContactsPage({
  ctx,
  initialFocusRefId = null,
  onConnectWhatsApp,
}: {
  ctx: AppContext
  initialFocusRefId?: string | null
  onConnectWhatsApp?: () => void
}) {
  const [refreshToken, setRefreshToken] = useState(0)
  const [progressPatch, setProgressPatch] = useState<ProgressPatch | null>(null)
  const [workspaceItem, setWorkspaceItem] = useState<AttendanceOpportunity | null>(null)
  const [taskItem, setTaskItem] = useState<AttendanceTaskItem | null>(null)

  /** Só executa se houver task real due — sem sintético. */
  const openTaskForContact = useCallback(async (item: AttendanceOpportunity) => {
    try {
      const due = await affiliateApi.attendanceTasks({ mode: 'due' })
      const hit = (due.tasks || []).find(
        (t) => String(t.ref_id) === String(item.ref_id) && String(t.ref_type) === String(item.ref_type),
      )
      if (hit && isTaskDue(hit.due_at)) {
        setWorkspaceItem(null)
        setTaskItem(hit)
        return
      }
      const up = await affiliateApi.attendanceTasks({ mode: 'upcoming', horizonDays: 30 })
      const future = (up.tasks || []).find(
        (t) => String(t.ref_id) === String(item.ref_id) && String(t.ref_type) === String(item.ref_type),
      )
      if (future) {
        ctx.showToast(
          `Próxima tarefa libera ${formatDueAt(future.due_at)} · ${formatCountdown(future.due_at)}`,
        )
        return
      }
      ctx.showToast('Nenhuma tarefa devida para este contato')
    } catch {
      ctx.showToast('Não foi possível carregar a tarefa', 'err')
    }
  }, [ctx])

  return (
    <div className="space-y-4 pb-2">
      <header className="rounded-[20px] border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-neutral-100 text-neutral-800">
            <Users size={20} strokeWidth={2.1} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold tracking-tight text-neutral-950">Contatos</h2>
            <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-500">
              Estado, próxima tarefa e histórico de cada pessoa.
            </p>
          </div>
        </div>
      </header>

      <AffiliateOpportunitiesPanel
        ctx={ctx}
        focusRefId={initialFocusRefId}
        refreshToken={refreshToken}
        progressPatch={progressPatch}
        onProgressPatchConsumed={() => setProgressPatch(null)}
        onOpenWorkspace={setWorkspaceItem}
      />

      {workspaceItem && !taskItem && (
        <AffiliateAttendanceWorkspace
          item={workspaceItem}
          ctx={ctx}
          onConnectWhatsApp={onConnectWhatsApp}
          onExecutePendingTask={() => { void openTaskForContact(workspaceItem) }}
          onClose={() => setWorkspaceItem(null)}
          onChanged={(patch) => {
            if (patch) {
              setProgressPatch(patch)
              const exit = new Set(['lost', 'dismiss', 'channel_unavailable', 'not_matching', 'convert'])
              if (exit.has(String(patch.action || '')) || patch.removed) {
                setWorkspaceItem(null)
              }
            } else {
              setRefreshToken((value) => value + 1)
            }
          }}
        />
      )}

      {taskItem && (
        <AffiliateTaskWorkspace
          task={taskItem}
          ctx={ctx}
          onConnectWhatsApp={onConnectWhatsApp}
          onClose={() => {
            setTaskItem(null)
            setRefreshToken((v) => v + 1)
          }}
          onOpenContact={(item) => {
            setTaskItem(null)
            setWorkspaceItem(item)
          }}
          onChanged={(patch) => {
            if (patch) {
              setProgressPatch(patch)
              const exit = new Set(['lost', 'dismiss', 'channel_unavailable', 'not_matching', 'convert'])
              if (exit.has(String(patch.action || '')) || patch.removed) {
                setTaskItem(null)
              }
            }
            setRefreshToken((v) => v + 1)
          }}
        />
      )}
    </div>
  )
}
