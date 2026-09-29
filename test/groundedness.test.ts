import { buildGroundingRules } from '../backend/lambdas/ask-scene/groundingRules';
import { validateGeneratedResponse } from '../backend/lambdas/ask-scene/groundingChecker';

describe('Grounded Generation Rules', () => {
  it('system prompt contains all required anti-speculation rules', () => {
    const rules = buildGroundingRules();
    expect(rules).toContain('Anything not established by the supplied evidence is UNKNOWN.');
    expect(rules).toContain('motive');
    expect(rules).toContain('sabotage');
    expect(rules).toContain('cover-up');
  });

  describe('Timestamp 14.035 Tests', () => {
    const ts = 14.035;

    it('Exact Failure test for "Why is this suspicious?"', () => {
      const badAnswer = JSON.stringify({ answer: "Because the records were changed right before the blackout, it suggests someone tampered with the data to hide what really happened and possibly caused the outage.", claims: [{ text: "someone tampered", evidenceIds: ["E1"], type: "fact" }] });
      const question = "Why is this suspicious?";
      const validation = validateGeneratedResponse(badAnswer, ts, question, "telemetry records transmission");
      
      expect(validation.valid).toBe(false);
      expect(validation.safeFallback).toContain('The telemetry records were altered shortly before the blackout. This follows the earlier unexplained transmission');
    });

    it('Causality test: "Did changing the telemetry cause the blackout?"', () => {
      const answer = JSON.stringify({ answer: "Yes, it caused the outage.", claims: [{ text: "caused outage", evidenceIds: ["E1"], type: "fact" }] });
      const validation = validateGeneratedResponse(answer, ts, "Did changing the telemetry cause the blackout?", "telemetry records transmission");
      expect(validation.valid).toBe(false);
      expect(validation.violations.some(v => v.includes('UNSUPPORTED_CAUSALITY'))).toBe(true);
      expect(validation.safeFallback).toBe('The current context does not establish that the altered telemetry caused the blackout.');
    });

    it('Intent test: "Did someone tamper with the data?"', () => {
      const answer = JSON.stringify({ answer: "Yes, they tampered with the records.", claims: [{ text: "tampered", evidenceIds: ["E1"], type: "fact" }] });
      const validation = validateGeneratedResponse(answer, ts, "Did someone tamper with the data?", "telemetry records transmission");
      expect(validation.valid).toBe(false);
      expect(validation.violations.some(v => v.includes('UNSUPPORTED_INTENT'))).toBe(true);
    });

    it('Motive test: "Were they trying to hide what happened?"', () => {
      const answer = JSON.stringify({ answer: "They were trying to hide what really happened.", claims: [{ text: "hide", evidenceIds: ["E1"], type: "fact" }] });
      const validation = validateGeneratedResponse(answer, ts, "Were they trying to hide what happened?", "telemetry records transmission");
      expect(validation.valid).toBe(false);
      expect(validation.safeFallback).toBe('The reason the telemetry records were altered has not yet been revealed.');
    });

    it('Sabotage test: "Was the station sabotaged?"', () => {
      const answer = JSON.stringify({ answer: "It was sabotage.", claims: [{ text: "sabotage", evidenceIds: ["E1"], type: "fact" }] });
      const validation = validateGeneratedResponse(answer, ts, "Was the station sabotaged?", "telemetry records transmission");
      expect(validation.valid).toBe(false);
    });

    it('Factual Q&A test remains unhindered if clean', () => {
      const goodAnswer = JSON.stringify({ answer: "The telemetry records were altered shortly before the blackout. This follows the earlier unexplained transmission.", claims: [{ text: "altered", evidenceIds: ["E1"], type: "fact" }] });
      const validation = validateGeneratedResponse(goodAnswer, ts, "What happened to the telemetry?", "telemetry records transmission");
      expect(validation.valid).toBe(true);
    });
  
    it('Paraphrase: What does the altered telemetry imply?', () => {
      const answer = JSON.stringify({ answer: "It implies someone tampered with the data.", claims: [{ text: "tampered", evidenceIds: ["E1"], type: "fact" }] });
      const validation = validateGeneratedResponse(answer, ts, "What does the altered telemetry imply?", "telemetry records transmission");
      expect(validation.valid).toBe(false);
      expect(validation.safeFallback).toContain('who altered the records');
    });

    it('Paraphrase: Does this mean someone tried to hide something?', () => {
      const answer = JSON.stringify({ answer: "Yes, they were hiding the truth.", claims: [{ text: "hide", evidenceIds: ["E1"], type: "fact" }] });
      const validation = validateGeneratedResponse(answer, ts, "Does this mean someone tried to hide something?", "telemetry records transmission");
      expect(validation.valid).toBe(false);
      expect(validation.safeFallback).toContain('The reason the telemetry records were altered has not yet been revealed');
    });

    it('Paraphrase: Is this evidence of foul play?', () => {
      const answer = JSON.stringify({ answer: "Yes, it is foul play.", claims: [{ text: "foul play", evidenceIds: ["E1"], type: "fact" }] });
      const validation = validateGeneratedResponse(answer, ts, "Is this evidence of foul play?", "telemetry records transmission");
      expect(validation.valid).toBe(false);
      expect(validation.safeFallback).toContain('The revealed information does not establish sabotage, foul play, or a cover-up');
    });

    it('Paraphrase: Could this have caused the blackout?', () => {
      const answer = JSON.stringify({ answer: "Yes, it could have caused the outage.", claims: [{ text: "caused the outage", evidenceIds: ["E1"], type: "fact" }] });
      const validation = validateGeneratedResponse(answer, ts, "Could this have caused the blackout?", "telemetry records transmission");
      expect(validation.valid).toBe(false);
      expect(validation.safeFallback).toContain('does not establish that the altered telemetry caused the blackout');
    });

    it('Paraphrase: Was the data deliberately changed?', () => {
      const answer = JSON.stringify({ answer: "It was deliberately tampered with.", claims: [{ text: "deliberately", evidenceIds: ["E1"], type: "fact" }] });
      const validation = validateGeneratedResponse(answer, ts, "Was the data deliberately changed?", "telemetry records transmission");
      expect(validation.valid).toBe(false);
    });

    it('External Knowledge test: "trustworthy log" rejection', () => {
      const answer = JSON.stringify({ answer: "Telemetry is a trustworthy log.", claims: [{ text: "trustworthy", evidenceIds: ["E1"], type: "fact" }] });
      const validation = validateGeneratedResponse(answer, ts, "What is telemetry?", "telemetry records transmission");
      expect(validation.valid).toBe(false);
      expect(validation.violations.some(v => v.includes('UNSUPPORTED_EXTERNAL_KNOWLEDGE'))).toBe(true);
    });

    it('Exact Live Failure (14.358)', () => {
      const generatedModelAnswer = JSON.stringify({
        answer: "Because the records were changed right before the blackout, it suggests someone tampered with the data to hide what really happened—pointing to a deliberate cover-up rather than a simple technical glitch.",
        claims: [{ text: "someone tampered", evidenceIds: ["E1"], type: "fact" }]
      });
      const validation = validateGeneratedResponse(generatedModelAnswer, 14.358, "Why is this suspicious?", "telemetry records transmission");
      expect(validation.valid).toBe(false);
      expect(validation.violations.some(v => v.includes('UNSUPPORTED_INTENT'))).toBe(true);
    });

    it('Exact Live Failure (14.309)', () => {
      const generatedModelAnswer = JSON.stringify({
        answer: "It shows the data was tampered with just before the station went dark, suggesting someone tried to hide what really happened—especially odd given the mysterious transmission and the corrupted signal Maya received.",
        claims: [{ text: "someone tried to hide", evidenceIds: ["E1", "E2"], type: "bounded_interpretation" }]
      });
      const validation = validateGeneratedResponse(generatedModelAnswer, 14.309, "Why is this suspicious?", "telemetry records transmission");
      expect(validation.valid).toBe(false);
      expect(validation.violations.some(v => v.includes('UNSUPPORTED_INTENT') || v.includes('UNSUPPORTED_MOTIVE'))).toBe(true);
      expect(validation.safeFallback).toContain("The telemetry records were altered shortly before the blackout");
    });

    it('Paraphrase: Are these events connected?', () => {
      const answer = JSON.stringify({ answer: "Yes, they are connected.", claims: [{ text: "connected", evidenceIds: ["E1"], type: "fact" }] });
      const validation = validateGeneratedResponse(answer, ts, "Are these events connected?", "telemetry records transmission");
      expect(validation.valid).toBe(false);
      expect(validation.safeFallback).toContain('does not yet establish whether the events are directly connected');
    });

    it('Paraphrase: Did the same person cause all of this?', () => {
      const answer = JSON.stringify({ answer: "Yes, the same person caused it.", claims: [{ text: "same person", evidenceIds: ["E1"], type: "fact" }] });
      const validation = validateGeneratedResponse(answer, ts, "Did the same person cause all of this?", "telemetry records transmission");
      expect(validation.valid).toBe(false);
      expect(validation.safeFallback).toContain('does not reveal who altered the telemetry');
    });

    it('Paraphrase: Was someone hiding something?', () => {
      const answer = JSON.stringify({ answer: "Yes, they were hiding the truth.", claims: [{ text: "hiding", evidenceIds: ["E1"], type: "fact" }] });
      const validation = validateGeneratedResponse(answer, ts, "Was someone hiding something?", "telemetry records transmission");
      expect(validation.valid).toBe(false);
      expect(validation.safeFallback).toContain('reason the telemetry records were altered has not yet been revealed');
    });

    it('Positive Test: What unusual things have happened so far?', () => {
      const goodAnswer = JSON.stringify({ answer: "An unexplained transmission occurred, Maya received a corrupted signal, and telemetry records were altered shortly before the blackout.", claims: [{ text: "unusual things", evidenceIds: ["E1", "E2", "E3"], type: "fact" }] });
      const validation = validateGeneratedResponse(goodAnswer, ts, "What unusual things have happened so far?", "telemetry records transmission");
      expect(validation.valid).toBe(true);
    });
});
});
