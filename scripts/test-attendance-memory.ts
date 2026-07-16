import {
  extractSlotsFromHistory,
  extractSlotsFromText,
  formatObjectiveAttendanceBlock,
} from "../src/services/attendanceMemory";

const history = [
  { direction: "incoming" as const, text: "Olá vocês fazem e entrega?" },
  { direction: "outgoing" as const, text: "Sim, entregamos. Uso é casa, negócio ou revenda?" },
  { direction: "incoming" as const, text: "Quero para meu restaurante." },
  { direction: "outgoing" as const, text: "Temos Alho Tipo A a 14 reais/kg." },
];

const slots = extractSlotsFromHistory(history, "Quero comprar");
console.log(JSON.stringify(slots, null, 2));
console.log("---");
console.log(formatObjectiveAttendanceBlock(slots, { turnCount: 3, historyDepth: 5 }));
console.log("--- single", extractSlotsFromText("Quero para meu restaurante"));
