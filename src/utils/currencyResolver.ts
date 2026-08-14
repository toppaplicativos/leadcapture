export type SupportedCurrency = 'BRL' | 'EUR' | 'USD';

export const EUROZONE_COUNTRIES = new Set([
  'AT', 'BE', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'PT', 'SK', 'SI', 'ES', 'AD', 'MC', 'SM', 'VA', 'ME', 'XK'
]);

export function countryToCurrency(countryCode?: string | null): SupportedCurrency {
  const code = String(countryCode || '').trim().toUpperCase();
  if (code === 'BR') return 'BRL';
  if (EUROZONE_COUNTRIES.has(code)) return 'EUR';
  if (code === 'US') return 'USD';
  return code ? 'USD' : 'BRL';
}

export function detectVisitorCurrencyFromReq(req: any): { currency: SupportedCurrency; country: string } {
  const countryHeader =
    req.headers?.['cf-ipcountry'] ||
    req.headers?.['x-vercel-ip-country'] ||
    req.headers?.['x-country'] ||
    req.headers?.['x-visitor-country'];

  let country = String(countryHeader || '').trim().toUpperCase();

  if (!country) {
    const lang = String(req.headers?.['accept-language'] || '').toLowerCase();
    if (lang.includes('pt-br')) country = 'BR';
    else if (
      lang.includes('pt-pt') ||
      lang.includes('es-es') ||
      lang.includes('de-de') ||
      lang.includes('fr-fr') ||
      lang.includes('it-it')
    ) {
      country = 'PT';
    } else if (lang.includes('en-us')) {
      country = 'US';
    }
  }

  const currency = countryToCurrency(country);
  return { currency, country: country || 'BR' };
}
