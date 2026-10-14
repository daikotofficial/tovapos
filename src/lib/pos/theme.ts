export const THEME_MODE_KEY_PREFIX = 'tovapos.themeMode';

export function tenantThemeModeKey(tenantId: string): string {
  return `${THEME_MODE_KEY_PREFIX}.${encodeURIComponent(tenantId)}`;
}

export function normalizeBrandColor(value: string | undefined): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#0d9488';
}

export function brandForeground(value: string | undefined): '#0f172a' | '#ffffff' {
  const hex = normalizeBrandColor(value).slice(1);
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const luminance = channels.reduce((total, channel, index) => {
    const linear = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return total + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
  return luminance > 0.48 ? '#0f172a' : '#ffffff';
}
