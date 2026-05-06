export const DEFAULT_LABEL_COLORS = [
  "#d4662c",
  "#b8563f",
  "#8f5bd6",
  "#4a7bd1",
  "#2f8f83",
  "#5f8f2f",
  "#b28704",
] as const;

function normalizeHexColor(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : null;
}

function getRgbChannels(hex: string) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function getRelativeLuminance(channel: number) {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function getLabelTextColor(background: string | undefined) {
  const normalized = normalizeHexColor(background);
  if (!normalized) return "#ffffff";
  const { r, g, b } = getRgbChannels(normalized);
  const luminance =
    0.2126 * getRelativeLuminance(r) + 0.7152 * getRelativeLuminance(g) + 0.0722 * getRelativeLuminance(b);
  return luminance > 0.45 ? "#1f2933" : "#ffffff";
}

export function getLabelBadgeStyle(background: string | undefined) {
  const normalized = normalizeHexColor(background) ?? "#6b7280";
  return {
    backgroundColor: normalized,
    color: getLabelTextColor(normalized),
    borderColor: "transparent",
  };
}
