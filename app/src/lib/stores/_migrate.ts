/**
 * One-shot migration from legacy Vue-era localStorage keys to the `crypteon.*` namespace.
 * Runs once per browser (guarded by `crypteon.migrated.v1` flag). Idempotent.
 *
 * Legacy → new mapping:
 *   theme                      → crypteon.theme
 *   openrouter-api-key \
 *   openrouter_api_key  } any  → crypteon.openrouterApiKey   (first non-empty wins)
 *   plinyos-api-key    /
 *   transformFavorites         → crypteon.transformFavorites
 *   transformLastUsed          → crypteon.transformLastUsed
 *   transformCategoryOrder     → crypteon.transformCategoryOrder
 *   transformOptionPrefs       → crypteon.transformOptionPrefs
 *   pc-model / pc-temperature  → crypteon.pc.model / crypteon.pc.temperature
 *   ac-model / ac-temperature  → crypteon.ac.model / crypteon.ac.temperature
 *   translate-model            → crypteon.translate.model
 *   pc-custom-langs            → crypteon.translate.customLangs
 *   EMOJI_COMPAT_CACHE         → in-memory only (left alone here)
 */

const FLAG = 'crypteon.migrated.v1';

const moves: Array<[string[], string]> = [
  [['theme'], 'crypteon.theme'],
  [['openrouter-api-key', 'openrouter_api_key', 'plinyos-api-key'], 'crypteon.openrouterApiKey'],
  [['transformFavorites'], 'crypteon.transformFavorites'],
  [['transformLastUsed'], 'crypteon.transformLastUsed'],
  [['transformCategoryOrder'], 'crypteon.transformCategoryOrder'],
  [['transformOptionPrefs'], 'crypteon.transformOptionPrefs'],
  [['pc-model'], 'crypteon.pc.model'],
  [['pc-temperature'], 'crypteon.pc.temperature'],
  [['ac-model'], 'crypteon.ac.model'],
  [['ac-temperature'], 'crypteon.ac.temperature'],
  [['translate-model'], 'crypteon.translate.model'],
  [['pc-custom-langs'], 'crypteon.translate.customLangs']
];

export function runLegacyMigration(): void {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(FLAG)) return;

  let migrated = 0;

  for (const [candidates, target] of moves) {
    if (localStorage.getItem(target) !== null) {
      // Target already populated — clean up legacy keys anyway.
      for (const c of candidates) localStorage.removeItem(c);
      continue;
    }
    for (const c of candidates) {
      const raw = localStorage.getItem(c);
      if (raw !== null && raw !== '') {
        try {
          // Store values as JSON so get() path is uniform.
          JSON.parse(raw);
          localStorage.setItem(target, raw);
        } catch {
          localStorage.setItem(target, JSON.stringify(raw));
        }
        migrated++;
        break;
      }
    }
    for (const c of candidates) localStorage.removeItem(c);
  }

  localStorage.setItem(FLAG, String(Date.now()));
  if (migrated > 0) {
    // One line, not noisy.
    console.info(`[crypteon] migrated ${migrated} legacy localStorage key${migrated === 1 ? '' : 's'}`);
  }

}
