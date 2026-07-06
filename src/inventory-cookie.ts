const COOKIE_NAME = "tscrossing-inventory";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const TILE_KEY_PATTERN = /^-?\d+,-?\d+$/;

export interface InventoryState {
  rocks: number;
  wood: number;
  mushrooms: number;
  collectedTreeNotes: string[];
}

function parseNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  const nRounded = Math.floor(value);
  return nRounded === value ? nRounded : null;
}

function parseTileKeyList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const aTileKeys: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !TILE_KEY_PATTERN.test(item)) {
      continue;
    }

    if (!aTileKeys.includes(item)) {
      aTileKeys.push(item);
    }
  }

  return aTileKeys;
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
    const nMushrooms = parseNonNegativeInteger(oParsed.mushrooms) ?? 0;
    if (nRocks === null || nWood === null) {
      return null;
    }

    return {
      rocks: nRocks,
      wood: nWood,
      mushrooms: nMushrooms,
      collectedTreeNotes: parseTileKeyList(oParsed.collectedTreeNotes),
    };
  } catch {
    return null;
  }
}

export function saveInventoryToCookie(oState: InventoryState): void {
  writeCookie(COOKIE_NAME, JSON.stringify(oState));
}
