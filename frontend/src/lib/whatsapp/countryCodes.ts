export const PAIRING_COUNTRY_CODES: [string, string][] = [
  ['55', 'Brasil'], ['1', 'EUA/Canada'], ['351', 'Portugal'], ['244', 'Angola'], ['258', 'Mocambique'],
  ['238', 'Cabo Verde'], ['245', 'Guine-Bissau'], ['239', 'S.Tome e Principe'], ['670', 'Timor-Leste'],
  ['54', 'Argentina'], ['56', 'Chile'], ['57', 'Colombia'], ['593', 'Equador'],
  ['52', 'Mexico'], ['51', 'Peru'], ['598', 'Uruguai'], ['58', 'Venezuela'], ['595', 'Paraguai'], ['591', 'Bolivia'],
  ['34', 'Espanha'], ['33', 'Franca'], ['49', 'Alemanha'], ['39', 'Italia'], ['44', 'Reino Unido'],
]

export function splitPhoneE164(phone: string | null | undefined): { country: string; local: string } {
  if (!phone) return { country: '55', local: '' }
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) {
    return { country: '55', local: digits.slice(2) }
  }
  if (digits.length >= 10) return { country: '55', local: digits }
  return { country: '55', local: digits }
}

export function formatPairingCode(code: string): string {
  return code.replace(/(.{4})/g, '$1-').replace(/-$/, '')
}