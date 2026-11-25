/** Smogon formats with usage data, grouped by the ruleset they belong to */
export interface FormatInfo {
  id: string; // Smogon/Showdown format id, e.g. "gen9ou"
  name: string;
  rulesetId: string;
}

export const FORMATS: FormatInfo[] = [
  { id: 'gen9ou', name: 'OU', rulesetId: 'gen9' },
  { id: 'gen9ubers', name: 'Ubers', rulesetId: 'gen9' },
  { id: 'gen9uu', name: 'UU', rulesetId: 'gen9' },
  { id: 'gen9ru', name: 'RU', rulesetId: 'gen9' },
  { id: 'gen9doublesou', name: 'Doubles OU', rulesetId: 'gen9' },
  { id: 'gen9monotype', name: 'Monotype', rulesetId: 'gen9' },
  { id: 'gen9lc', name: 'Little Cup', rulesetId: 'gen9' },
  { id: 'gen9nationaldex', name: 'National Dex OU', rulesetId: 'gen9natdex' },
  { id: 'gen8ou', name: 'OU', rulesetId: 'gen8' },
  { id: 'gen8doublesou', name: 'Doubles OU', rulesetId: 'gen8' },
  { id: 'gen8nationaldex', name: 'National Dex OU', rulesetId: 'gen8natdex' },
  { id: 'gen7ou', name: 'OU', rulesetId: 'gen7' },
  { id: 'gen6ou', name: 'OU', rulesetId: 'gen6' },
  { id: 'gen5ou', name: 'OU', rulesetId: 'gen5' },
  { id: 'gen4ou', name: 'OU', rulesetId: 'gen4' },
  { id: 'gen3ou', name: 'OU', rulesetId: 'gen3' },
  { id: 'gen2ou', name: 'OU', rulesetId: 'gen2' },
  { id: 'gen1ou', name: 'OU', rulesetId: 'gen1' },
];

export const formatsFor = (rulesetId: string) => FORMATS.filter((f) => f.rulesetId === rulesetId);
