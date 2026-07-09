import type { AutomationTrigger, Frequencia, Horario } from './schema'

export function buildCron(input: {
  frequencia: Frequencia
  horarios?: Horario[]
  diasSemana?: number[]
  diasMes?: number[]
  intervaloMinutos?: number
}): string {
  const { frequencia, horarios = [], diasSemana = [], diasMes = [], intervaloMinutos } = input
  const horarioParts = (() => {
    if (!horarios.length) return { minuto: '0', hora: '9' }
    const minutos = Array.from(new Set(horarios.map((h) => h.minuto))).sort((a, b) => a - b)
    const horas = Array.from(new Set(horarios.map((h) => h.hora))).sort((a, b) => a - b)
    return { minuto: minutos.join(','), hora: horas.join(',') }
  })()

  switch (frequencia) {
    case 'diario':
      return `${horarioParts.minuto} ${horarioParts.hora} * * *`
    case 'semanal': {
      const dow = diasSemana.length ? [...diasSemana].sort((a, b) => a - b).join(',') : '*'
      return `${horarioParts.minuto} ${horarioParts.hora} * * ${dow}`
    }
    case 'mensal': {
      const dom = diasMes.length ? [...diasMes].sort((a, b) => a - b).join(',') : '1'
      return `${horarioParts.minuto} ${horarioParts.hora} ${dom} * *`
    }
    case 'intervalo': {
      const m = Math.max(1, Math.min(intervaloMinutos || 30, 30 * 24 * 60))
      if (m < 60) return `*/${m} * * * *`
      if (m % 60 === 0) return m === 60 ? '0 * * * *' : `0 */${m / 60} * * *`
      return `@interval:${m}`
    }
    default:
      return '0 9 * * *'
  }
}

export function describeTriggerSchedule(trigger: AutomationTrigger): string {
  if (trigger.tipo !== 'agendamento') return ''
  if (trigger.frequencia === 'intervalo') {
    const m = trigger.intervaloMinutos || 30
    if (m < 60) return `A cada ${m} min`
    if (m % 60 === 0) return `A cada ${m / 60}h`
    return `A cada ${m} min`
  }
  if (trigger.frequencia === 'uma_vez' && trigger.dataHoraUnica) {
    return `Uma vez — ${new Date(trigger.dataHoraUnica).toLocaleString('pt-BR')}`
  }
  const labels: Record<Frequencia, string> = {
    diario: 'Diário',
    semanal: 'Semanal',
    mensal: 'Mensal',
    uma_vez: 'Uma vez',
    intervalo: 'Intervalo',
  }
  const h = trigger.horarios?.[0]
  const time = h ? `${String(h.hora).padStart(2, '0')}:${String(h.minuto).padStart(2, '0')}` : ''
  return `${labels[trigger.frequencia]}${time ? ` às ${time}` : ''}`
}