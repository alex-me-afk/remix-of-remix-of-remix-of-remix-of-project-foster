/**
 * Vault — player inventory of owned cosmetics, skills and pet unlocks.
 *
 * The vault is a simple catalogue of everything the player owns. It groups
 * items by category (weapon skins, passives, pets) and shows rarity/colour.
 */

export type VaultItem =
  | { type: "skin"; id: string }
  | { type: "passive"; id: string }
  | { type: "pet"; id: string };

const KEY = "ironhowl.vault.v1";

export function defaultVault(): string[] {
  return [];
}

export function loadVault(): string[] {
  if (typeof window === "undefined") return defaultVault();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultVault();
    const saved = JSON.parse(raw) as unknown;
    if (!Array.isArray(saved)) return defaultVault();
    return saved.filter((s): s is string => typeof s === "string");
  } catch {
    return defaultVault();
  }
}

export function saveVault(items: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* private mode */
  }
}

export function addVaultItem(items: string[], id: string) {
  if (items.includes(id)) return items;
  return [...items, id];
}

export function hasVaultItem(items: string[], id: string) {
  return items.includes(id);
}
