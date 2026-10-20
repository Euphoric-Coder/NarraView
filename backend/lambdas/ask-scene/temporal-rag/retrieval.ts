import { TemporalSnapshot, RetrievalDocument, Citation, TemporalMode } from './types';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'what', 'when', 'where', 'which', 'who', 'why', 'how', 'does',
  'did', 'can', 'could', 'would', 'should', 'about', 'this', 'there', 'they'
]);

export function normalizeQuery(query: string, snapshot: TemporalSnapshot): { normalized: string; keywords: string[] } {
  if (!query) return { normalized: '', keywords: [] };
  let normalized = query.toLowerCase().trim();

  // Alias expansion based on unlocked entities, people, and concepts
  const allAliases: Array<{ alias: string; canonical: string }> = [];
  snapshot.unlockedEntities.forEach(e => {
    (e.aliases || []).forEach(a => allAliases.push({ alias: a.toLowerCase(), canonical: e.name.toLowerCase() }));
  });
  snapshot.unlockedPeople.forEach(p => {
    (p.aliases || []).forEach(a => allAliases.push({ alias: a.toLowerCase(), canonical: p.name.toLowerCase() }));
  });
  snapshot.unlockedConcepts.forEach(c => {
    (c.aliases || []).forEach(a => allAliases.push({ alias: a.toLowerCase(), canonical: c.name.toLowerCase() }));
  });

  allAliases.forEach(({ alias, canonical }) => {
    if (alias && alias !== canonical && normalized.includes(alias)) {
      normalized = normalized.replace(new RegExp(`\\b${alias}\\b`, 'gi'), `${alias} ${canonical}`);
    }
  });

  const tokens = normalized
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));

  return { normalized, keywords: Array.from(new Set(tokens)) };
}

/**
 * Builds candidate documents exclusively from the safe temporal snapshot.
 * Future knowledge cannot exist here by definition.
 */
export function buildRetrievalDocuments(snapshot: TemporalSnapshot): RetrievalDocument[] {
  const docs: RetrievalDocument[] = [];

  // Facts
  snapshot.unlockedFacts.forEach(f => {
    docs.push({
      id: f.id,
      type: 'fact',
      text: f.statement || (f as any).text || '',
      revealTime: f.revealTime,
      segmentId: f.segmentId,
      evidenceTranscriptIndices: f.evidenceTranscriptIndices || []
    });
  });

  // Events
  snapshot.unlockedEvents.forEach(e => {
    docs.push({
      id: e.id,
      type: 'event',
      text: e.description,
      revealTime: e.revealTime,
      segmentId: e.segmentId,
      evidenceTranscriptIndices: e.evidenceTranscriptIndices || []
    });
  });

  // Entities
  snapshot.unlockedEntities.forEach(e => {
    const aliasStr = e.aliases?.length ? ` (Also known as: ${e.aliases.join(', ')})` : '';
    docs.push({
      id: e.id,
      type: 'entity',
      text: `${e.name} (${e.entityType}): ${e.description}${aliasStr}`,
      revealTime: e.firstKnownAt,
      aliases: e.aliases,
      evidenceTranscriptIndices: e.evidenceTranscriptIndices || []
    });
  });

  // People
  snapshot.unlockedPeople.forEach(p => {
    const aliasStr = p.aliases?.length ? ` (Also known as: ${p.aliases.join(', ')})` : '';
    docs.push({
      id: p.id,
      type: 'person',
      text: `${p.name} (${p.role}): ${p.description}${aliasStr}`,
      revealTime: p.firstKnownAt,
      aliases: p.aliases,
      evidenceTranscriptIndices: p.evidenceTranscriptIndices || []
    });
  });

  // Concepts
  snapshot.unlockedConcepts.forEach(c => {
    const aliasStr = c.aliases?.length ? ` (Related: ${c.aliases.join(', ')})` : '';
    docs.push({
      id: c.id,
      type: 'concept',
      text: `${c.name}: ${c.description}${aliasStr}`,
      revealTime: c.firstKnownAt,
      aliases: c.aliases,
      evidenceTranscriptIndices: c.evidenceTranscriptIndices || []
    });
  });

  // Relationships
  snapshot.unlockedRelationships.forEach(r => {
    docs.push({
      id: r.id,
      type: 'relationship',
      text: r.description || `Relation: ${r.sourceId} ${r.predicate} ${r.targetId}`,
      revealTime: r.revealTime,
      evidenceTranscriptIndices: r.evidenceTranscriptIndices || []
    });
  });

  // Segments (Summary of past segments or title of current)
  snapshot.unlockedSegments.forEach(s => {
    docs.push({
      id: s.segmentId,
      type: 'segment',
      text: `${s.title}: ${s.summary}`,
      revealTime: s.startTime,
      segmentId: s.segmentId,
      evidenceTranscriptIndices: []
    });
  });

  return docs;
}

/**
 * Retrieves top-k most relevant evidence documents from the safe temporal snapshot.
 * Retrieval happens strictly AFTER temporal filtering.
 */
export function retrieveSafeEvidence(
  snapshot: TemporalSnapshot,
  query: string,
  mode: TemporalMode = 'ask',
  topK: number = 8,
  watchedIntervals?: Array<{ start: number; end: number }>
): { documents: RetrievalDocument[]; citations: Citation[] } {
  const docs = buildRetrievalDocuments(snapshot);
  if (docs.length === 0) {
    return { documents: [], citations: [] };
  }

  const { normalized, keywords } = normalizeQuery(query, snapshot);

  if (mode === 'previously_on' || mode === 'recap') {
    const recapTopK = Math.max(topK, 10);
    // Deterministic scoring for personalized return recap (Part L)
    docs.forEach(doc => {
      let score = 0;
      if (doc.type === 'event') score += 12;
      else if (doc.type === 'segment') score += 8;
      else if (doc.type === 'fact') score += 6;
      else if (doc.type === 'concept') score += 5;
      else if (doc.type === 'entity' || doc.type === 'person') score += 4;
      else if (doc.type === 'relationship') score += 3;

      // Proximity to current resume position
      const age = snapshot.viewerTimestamp - doc.revealTime;
      if (age >= 0 && age <= 60) {
        score += 6; // Close to current segment
      } else if (age > 60 && age <= 120) {
        score += 3; // Recent past
      }

      // Personalized watch coverage classification & weighting (Part C, L)
      if (watchedIntervals && watchedIntervals.length > 0) {
        const isWatched = watchedIntervals.some(i => doc.revealTime >= (i.start - 0.5) && doc.revealTime <= (i.end + 0.5));
        if (isWatched) {
          score += 25; // Watched coverage boost
          doc.coverageStatus = 'watched';
        } else {
          score -= 30; // Skipped range deprioritization
          doc.coverageStatus = 'skipped';
        }
      } else {
        doc.coverageStatus = 'unknown';
      }

      doc.relevanceScore = score;
    });

    docs.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0) || b.revealTime - a.revealTime);
    const selected = docs.slice(0, Math.min(recapTopK, docs.length));

    const watchedCount = selected.filter(d => d.coverageStatus === 'watched').length;
    const skippedCount = selected.filter(d => d.coverageStatus === 'skipped').length;

    console.log('[VIEWER_TELEMETRY] RECAP_EVIDENCE_SELECTED', {
      totalCandidates: docs.length,
      selectedCount: selected.length,
      watchedCount,
      skippedCount,
      viewerTimestamp: snapshot.viewerTimestamp,
      maxRevealTime: selected.length > 0 ? Math.max(...selected.map(d => d.revealTime)) : 0
    });

    return buildResult(selected, snapshot.viewerTimestamp);
  }

  if (mode === 'explain_simple') {
    // Explain Simply prioritizes concepts, entities, and facts
    docs.forEach(doc => {
      let score = 0;
      if (doc.type === 'concept') score += 8;
      if (doc.type === 'entity') score += 6;
      if (doc.type === 'fact') score += 4;

      const lowerText = doc.text.toLowerCase();
      if (normalized && lowerText.includes(normalized)) score += 15;
      keywords.forEach(kw => {
        if (lowerText.includes(kw)) score += 4;
      });

      doc.relevanceScore = score;
    });

    docs.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0) || b.revealTime - a.revealTime);
    const selected = docs.slice(0, Math.min(topK, docs.length));
    return buildResult(selected, snapshot.viewerTimestamp);
  }

  if (mode === 'learn') {
    // Learn Mode prioritizes concepts and primary facts
    docs.forEach(doc => {
      let score = 0;
      if (doc.type === 'concept') score += 10;
      if (doc.type === 'fact') score += 8;
      if (doc.type === 'relationship') score += 4;
      doc.relevanceScore = score;
    });

    docs.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0) || b.revealTime - a.revealTime);
    const selected = docs.slice(0, Math.min(topK, docs.length));
    return buildResult(selected, snapshot.viewerTimestamp);
  }

  // General Ask mode: lexical + keyword match scoring
  docs.forEach(doc => {
    let score = 0;
    const lowerText = doc.text.toLowerCase();

    // Exact phrase match
    if (normalized && lowerText.includes(normalized)) {
      score += 15;
    }

    // Keyword hits
    keywords.forEach(kw => {
      if (lowerText.includes(kw)) {
        score += 3;
      }
    });

    // Alias hits
    if (doc.aliases?.length) {
      doc.aliases.forEach(al => {
        if (normalized.includes(al.toLowerCase())) score += 6;
      });
    }

    // Boost facts and events slightly for factual answers
    if (doc.type === 'fact') score += 2;
    if (doc.type === 'event') score += 2;

    // Slight recency boost within 45 seconds of current timestamp
    const timeDelta = snapshot.viewerTimestamp - doc.revealTime;
    if (timeDelta >= 0 && timeDelta <= 45) {
      score += 1.5;
    }

    doc.relevanceScore = score;
  });

  // Sort by relevance score descending, then by revealTime descending
  docs.sort((a, b) => {
    const diff = (b.relevanceScore || 0) - (a.relevanceScore || 0);
    if (Math.abs(diff) > 0.1) return diff;
    return b.revealTime - a.revealTime;
  });

  // If query had keywords, filter to docs with score > 0, otherwise take top-k
  let selected = keywords.length > 0
    ? docs.filter(d => (d.relevanceScore || 0) > 0).slice(0, topK)
    : docs.slice(0, topK);

  // If no direct keyword matches were found, fallback to recent safe facts/events
  if (selected.length === 0) {
    selected = docs.slice(0, Math.min(topK, 5));
  }

  return buildResult(selected, snapshot.viewerTimestamp);
}

function buildResult(selectedDocs: RetrievalDocument[], viewerTimestamp: number): { documents: RetrievalDocument[]; citations: Citation[] } {
  const citations: Citation[] = selectedDocs.map(doc => {
    // Invariant check: citation reveal time must NEVER exceed viewerTimestamp
    if (doc.revealTime > viewerTimestamp + 0.001) {
      throw new Error(`Temporal Invariant Violated: Citation revealTime (${doc.revealTime}) > viewerTimestamp (${viewerTimestamp})`);
    }

    return {
      type: doc.type,
      id: doc.id,
      segmentId: doc.segmentId,
      revealTime: doc.revealTime,
      evidenceTranscriptIndices: doc.evidenceTranscriptIndices,
      textSnippet: (doc.text || '').length > 100 ? (doc.text || '').substring(0, 97) + '...' : (doc.text || '')
    };
  });

  return { documents: selectedDocs, citations };
}
