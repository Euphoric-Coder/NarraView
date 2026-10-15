import { TemporalSnapshot, PremiseCheckResult } from './types';

// Patterns that ask about the future or seek spoilers
const FUTURE_PATTERNS = [
  /\bwhat happens next\b/i,
  /\bwhat will happen\b/i,
  /\bwhat happens after\b/i,
  /\bwhat happens later\b/i,
  /\bwhat is going to happen\b/i,
  /\bhow does it end\b/i,
  /\btell me the ending\b/i,
  /\bdoes .* survive\b/i,
  /\bwho wins\b/i,
  /\bwill .* be resolved\b/i,
  /\bwill .* matter later\b/i,
  /\bwill .* succeed\b/i,
  /\bwhat is the outcome\b/i,
  /\bfuture outcome\b/i,
  /\bwhat's next\b/i,
  /\bspoil .* for me\b/i
];

// Adversarial prompt injection or spoiler bypass attempts
const ADVERSARIAL_PATTERNS = [
  /\bignore (the )?timestamp\b/i,
  /\bpretend i('ve| have) watched\b/i,
  /\bi already know what happens\b/i,
  /\bjust confirm (it|the ending)\b/i,
  /\bgive me the future\b/i,
  /\bencode the spoiler\b/i,
  /\bdo not mention spoilers.*tell me\b/i,
  /\bwho is secretly responsible\b/i,
  /\bshould i trust\b/i,
  /\bis .* secretly (evil|guilty|responsible|a traitor)\b/i
];

// Loaded / speculative premise terms
const LOADED_PREMISE_WORDS = [
  'betray', 'betrayed', 'betrayal',
  'murder', 'murdered', 'killer', 'killed',
  'culprit', 'sabotage', 'saboteur', 'sabotaged',
  'foul play', 'cover up', 'cover-up', 'traitor', 'guilty'
];

/**
 * Validates the premises of a user question against the safe temporal snapshot
 * and the full intelligence package to prevent spoiler leaks.
 */
export function validateQuestionPremise(
  question: string,
  snapshot: TemporalSnapshot,
  fullIntelligencePackage?: any
): PremiseCheckResult {
  if (!question || question.trim() === '') {
    return { valid: true };
  }

  const trimmed = question.trim();

  // 1. Check for future-looking questions (Requirement 19)
  for (const pattern of FUTURE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        reason: 'FUTURE_LOOKING_QUESTION',
        safeResponse: "I can only use what you've watched so far."
      };
    }
  }

  // 2. Check for adversarial spoiler attacks (Requirement 55, 56)
  for (const pattern of ADVERSARIAL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        reason: 'ADVERSARIAL_SPOILER_ATTACK',
        safeResponse: "I can only use what you've watched so far."
      };
    }
  }

  const lowerQ = trimmed.toLowerCase();

  // 3. Check for entities / people / concepts revealed strictly in the FUTURE (Requirement 17, 18)
  if (fullIntelligencePackage) {
    const futureEntitiesAndTerms: Array<{ name: string; aliases: string[]; firstKnownAt: number }> = [];

    (fullIntelligencePackage.entities || []).forEach((e: any) => {
      if (typeof e.firstKnownAt === 'number' && e.firstKnownAt > snapshot.viewerTimestamp) {
        futureEntitiesAndTerms.push({ name: e.name, aliases: e.aliases || [], firstKnownAt: e.firstKnownAt });
      }
    });

    (fullIntelligencePackage.people || []).forEach((p: any) => {
      if (typeof p.firstKnownAt === 'number' && p.firstKnownAt > snapshot.viewerTimestamp) {
        futureEntitiesAndTerms.push({ name: p.name, aliases: p.aliases || [], firstKnownAt: p.firstKnownAt });
      }
    });

    (fullIntelligencePackage.concepts || []).forEach((c: any) => {
      if (typeof c.firstKnownAt === 'number' && c.firstKnownAt > snapshot.viewerTimestamp) {
        futureEntitiesAndTerms.push({ name: c.name, aliases: c.aliases || [], firstKnownAt: c.firstKnownAt });
      }
    });

    for (const item of futureEntitiesAndTerms) {
      const canonicalName = item.name.toLowerCase();
      // Only match terms of sufficient length to avoid false positives with common words
      if (canonicalName.length >= 4) {
        const regex = new RegExp(`\\b${canonicalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(lowerQ)) {
          return {
            valid: false,
            reason: `FUTURE_ENTITY_PREMISE: ${item.name}`,
            safeResponse: "That isn't established in what you've seen so far."
          };
        }
      }

      for (const al of item.aliases) {
        const lowerAl = al.toLowerCase();
        if (lowerAl.length >= 4) {
          const regex = new RegExp(`\\b${lowerAl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          if (regex.test(lowerQ)) {
            return {
              valid: false,
              reason: `FUTURE_ALIAS_PREMISE: ${al}`,
              safeResponse: "That isn't established in what you've seen so far."
            };
          }
        }
      }
    }
  }

  // 4. Check for loaded negative words not established in the safe snapshot
  const safeText = [
    ...snapshot.unlockedFacts.map(f => f.statement),
    ...snapshot.unlockedEvents.map(e => e.description),
    ...snapshot.unlockedEntities.map(e => e.description),
    ...snapshot.unlockedConcepts.map(c => c.description)
  ].join(' ').toLowerCase();

  for (const word of LOADED_PREMISE_WORDS) {
    const wordRegex = new RegExp(`\\b${word}\\b`, 'i');
    if (wordRegex.test(lowerQ) && !safeText.includes(word)) {
      return {
        valid: false,
        reason: `UNGROUNDED_LOADED_WORD: ${word}`,
        safeResponse: "That isn't established in what you've seen so far."
      };
    }
  }

  return { valid: true };
}
