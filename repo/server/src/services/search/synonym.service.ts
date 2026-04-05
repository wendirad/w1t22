import { Synonym } from '../../models/synonym.model';

let synonymCache: Map<string, Map<string, string[]>> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000;

async function loadSynonyms(): Promise<Map<string, Map<string, string[]>>> {
  const now = Date.now();
  if (synonymCache && now - cacheTimestamp < CACHE_TTL) {
    return synonymCache;
  }

  const synonyms = await Synonym.find({});
  const cache = new Map<string, Map<string, string[]>>();

  for (const syn of synonyms) {
    if (!cache.has(syn.field)) {
      cache.set(syn.field, new Map());
    }
    const fieldMap = cache.get(syn.field)!;

    fieldMap.set(syn.canonical.toLowerCase(), syn.aliases.map((a) => a.toLowerCase()));

    for (const alias of syn.aliases) {
      fieldMap.set(alias.toLowerCase(), [syn.canonical.toLowerCase()]);
    }
  }

  synonymCache = cache;
  cacheTimestamp = now;
  return cache;
}

export async function expandSynonyms(
  term: string,
  field: string = 'make'
): Promise<string[]> {
  const cache = await loadSynonyms();
  const fieldMap = cache.get(field);
  if (!fieldMap) return [term];

  const lowerTerm = term.toLowerCase();
  const expansions = fieldMap.get(lowerTerm);
  if (!expansions) return [term];

  return [term, ...expansions];
}

export function clearSynonymCache(): void {
  synonymCache = null;
  cacheTimestamp = 0;
}
