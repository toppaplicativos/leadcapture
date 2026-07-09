/**
 * Cron builder + next-run calculation (ported from Tattoo AI automacoes/cron-builder).
 */

export type AutomationFrequencia = "diario" | "semanal" | "mensal" | "uma_vez" | "intervalo";

export interface AutomationHorario {
  hora: number;
  minuto: number;
}

export interface TriggerAgendamento {
  tipo: "agendamento";
  frequencia: AutomationFrequencia;
  horarios?: AutomationHorario[];
  diasSemana?: number[];
  diasMes?: number[];
  dataHoraUnica?: string;
  intervaloMinutos?: number;
  cron: string;
  timezone?: string;
}

export interface TriggerEvento {
  tipo: "evento";
  plataforma: "instagram" | "whatsapp" | "email" | "leads";
  evento: string;
  palavrasChave?: string[];
  postId?: string;
  grupoId?: string;
}

export type AutomationTrigger = TriggerAgendamento | TriggerEvento;

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";
export const INTERVALO_MIN_MINUTOS = 1;
export const INTERVALO_MAX_MINUTOS = 30 * 24 * 60;

export function normalizeIntervaloMinutos(value?: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < INTERVALO_MIN_MINUTOS) return 30;
  return Math.min(Math.round(n), INTERVALO_MAX_MINUTOS);
}

function buildIntervalCron(intervaloMinutos?: number): string {
  const total = normalizeIntervaloMinutos(intervaloMinutos);
  if (total < 60) return `*/${total} * * * *`;
  if (total % 1440 === 0) {
    const days = total / 1440;
    return days === 1 ? "0 0 * * *" : `0 0 */${days} * *`;
  }
  if (total % 60 === 0) {
    const hours = total / 60;
    return hours === 1 ? "0 * * * *" : `0 */${hours} * * *`;
  }
  return `@interval:${total}`;
}

export function buildCron(input: {
  frequencia: AutomationFrequencia;
  horarios?: AutomationHorario[];
  diasSemana?: number[];
  diasMes?: number[];
  intervaloMinutos?: number;
  dataHoraUnica?: string;
}): string {
  const { frequencia, horarios = [], diasSemana = [], diasMes = [], intervaloMinutos, dataHoraUnica } = input;

  const horarioParts = (() => {
    if (!horarios.length) return { minuto: "0", hora: "9" };
    const minutos = Array.from(new Set(horarios.map((h) => h.minuto))).sort((a, b) => a - b);
    const horas = Array.from(new Set(horarios.map((h) => h.hora))).sort((a, b) => a - b);
    return { minuto: minutos.join(","), hora: horas.join(",") };
  })();

  switch (frequencia) {
    case "diario":
      return `${horarioParts.minuto} ${horarioParts.hora} * * *`;
    case "semanal": {
      const dow = diasSemana.length ? [...diasSemana].sort((a, b) => a - b).join(",") : "*";
      return `${horarioParts.minuto} ${horarioParts.hora} * * ${dow}`;
    }
    case "mensal": {
      const dom = diasMes.length ? [...diasMes].sort((a, b) => a - b).join(",") : "1";
      return `${horarioParts.minuto} ${horarioParts.hora} ${dom} * *`;
    }
    case "intervalo":
      return buildIntervalCron(intervaloMinutos);
    case "uma_vez": {
      if (!dataHoraUnica) return "0 0 * * *";
      const d = new Date(dataHoraUnica);
      return `${d.getUTCMinutes()} ${d.getUTCHours()} ${d.getUTCDate()} ${d.getUTCMonth() + 1} *`;
    }
    default:
      return "0 9 * * *";
  }
}

function parseIntervalMarker(cron: string): number | null {
  const match = cron.match(/^@interval:(\d+)$/);
  if (!match) return null;
  return normalizeIntervaloMinutos(parseInt(match[1], 10));
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);

  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    weekday: weekdayMap[value("weekday")] ?? 0,
  };
}

export function nextExecution(cron: string, from: Date = new Date(), timeZone = DEFAULT_TIMEZONE): Date | null {
  const intervalMinutes = parseIntervalMarker(cron);
  if (intervalMinutes) return new Date(from.getTime() + intervalMinutes * 60 * 1000);

  const parts = cron.split(/\s+/);
  if (parts.length !== 5) return null;
  const [minPart, hourPart, dayPart, monthPart, dowPart] = parts;

  const parseField = (p: string, max: number, min = 0): number[] => {
    if (p === "*") {
      const arr: number[] = [];
      for (let i = min; i <= max; i++) arr.push(i);
      return arr;
    }
    if (p.startsWith("*/")) {
      const step = parseInt(p.slice(2), 10);
      if (!step || step < 1) return [];
      const arr: number[] = [];
      for (let i = min; i <= max; i += step) arr.push(i);
      return arr;
    }
    return p.split(",").map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
  };

  const minutes = parseField(minPart, 59);
  const hours = parseField(hourPart, 23);
  const days = parseField(dayPart, 31, 1);
  const months = parseField(monthPart, 12, 1);
  const dows = parseField(dowPart, 6);

  const candidate = new Date(from.getTime() + 60 * 1000);
  candidate.setSeconds(0, 0);

  for (let i = 0; i < 60 * 24 * 366; i++) {
    const local = getTimeZoneParts(candidate, timeZone);
    if (
      months.includes(local.month) &&
      (dayPart === "*" || days.includes(local.day)) &&
      (dowPart === "*" || dows.includes(local.weekday)) &&
      hours.includes(local.hour) &&
      minutes.includes(local.minute)
    ) {
      return candidate;
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  return null;
}

export function nextTriggerExecution(trigger: TriggerAgendamento, from: Date = new Date()): Date | null {
  const tz = trigger.timezone || DEFAULT_TIMEZONE;
  if (trigger.frequencia === "intervalo") {
    const minutes = normalizeIntervaloMinutos(trigger.intervaloMinutos);
    return new Date(from.getTime() + minutes * 60 * 1000);
  }
  if (trigger.frequencia === "uma_vez" && trigger.dataHoraUnica) {
    const at = new Date(trigger.dataHoraUnica);
    return at.getTime() > from.getTime() ? at : null;
  }
  return nextExecution(trigger.cron, from, tz);
}

export function describeTriggerSchedule(trigger: AutomationTrigger): string {
  if (trigger.tipo !== "agendamento") return "";
  if (trigger.frequencia === "intervalo") {
    const m = normalizeIntervaloMinutos(trigger.intervaloMinutos);
    if (m < 60) return `A cada ${m} min`;
    if (m % 60 === 0) return `A cada ${m / 60}h`;
    return `A cada ${m} min`;
  }
  if (trigger.frequencia === "uma_vez" && trigger.dataHoraUnica) {
    return `Uma vez em ${new Date(trigger.dataHoraUnica).toLocaleString("pt-BR")}`;
  }
  return trigger.cron || "Agendado";
}