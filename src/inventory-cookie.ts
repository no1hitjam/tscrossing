const COOKIE_NAME = "tscrossing-inventory";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface InventoryState {
  rocks: number;
  wood: number;
}

function parseNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  const nRounded = Math.floor(value);
  return nRounded === value ? nRounded : null;
}

function readCookie(sName: string): string | null {
  const sEscapedName = sName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const oMatch = document.cookie.match(
    new RegExp(`(?:^|; )${sEscapedName}=([^;]*)`),
  );
  return oMatch ? decodeURIComponent(oMatch[1]) : null;
}

function writeCookie(sName: string, sValue: string): void {
  document.cookie = `${sName}=${encodeURIComponent(sValue)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function loadInventoryFromCookie(): InventoryState | null {
  const sCookieValue = readCookie(COOKIE_NAME);
  if (sCookieValue === null) {
    return null;
  }

  try {
    const oParsed = JSON.parse(sCookieValue) as Partial<InventoryState>;
    const nRocks = parseNonNegativeInteger(oParsed.rocks);
    const nWood = parseNonNegativeInteger(oParsed.wood);
    if (nRocks === null || nWood === null) {
      return null;
    }

    return { rocks: nRocks, wood: nWood };
  } catch {
    return null;
  }
}

export function saveInventoryToCookie(nRocks: number, nWood: number): void {
  writeCookie(
    COOKIE_NAME,
    JSON.stringify({ rocks: nRocks, wood: nWood }),
  );
}
