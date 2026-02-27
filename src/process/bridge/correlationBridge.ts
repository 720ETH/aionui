/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '../../common';
import type {
  IMarketEvent,
  IEventOutcome,
  ICorrelationRule,
  IPrediction,
  ICorrelationStats,
  MarketEventType,
  CorrelationDirection,
} from '../../common/ipcBridge';
import { getDatabase } from '@process/database';
import { uuid } from '../../common/utils';

// ─── Row types (DB snake_case) ─────────────────────────────────────────────

interface MarketEventRow {
  id: string;
  user_id: string;
  event_type: string;
  title: string;
  description: string | null;
  tickers: string;
  sector: string | null;
  source: string | null;
  severity: number;
  occurred_at: number;
  created_at: number;
}

interface EventOutcomeRow {
  id: string;
  event_id: string;
  ticker: string;
  price_before: number;
  price_after: number;
  percent_change: number;
  measured_at: number;
  created_at: number;
}

interface CorrelationRuleRow {
  id: string;
  user_id: string;
  event_type: string;
  sector: string | null;
  ticker: string | null;
  direction: string;
  avg_impact: number;
  weight: number;
  sample_count: number;
  hit_count: number;
  miss_count: number;
  last_updated: number;
  created_at: number;
}

interface PredictionRow {
  id: string;
  user_id: string;
  event_id: string;
  ticker: string;
  predicted_direction: string;
  predicted_impact: number;
  confidence: number;
  actual_direction: string | null;
  actual_impact: number | null;
  is_correct: number | null;
  created_at: number;
  verified_at: number | null;
}

// ─── Row → DTO converters ──────────────────────────────────────────────────

function rowToEvent(row: MarketEventRow, outcomeCount?: number): IMarketEvent {
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type as MarketEventType,
    title: row.title,
    description: row.description ?? undefined,
    tickers: JSON.parse(row.tickers) as string[],
    sector: row.sector ?? undefined,
    source: row.source ?? undefined,
    severity: row.severity,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    outcomeCount,
  };
}

function rowToOutcome(row: EventOutcomeRow): IEventOutcome {
  return {
    id: row.id,
    eventId: row.event_id,
    ticker: row.ticker,
    priceBefore: row.price_before,
    priceAfter: row.price_after,
    percentChange: row.percent_change,
    measuredAt: row.measured_at,
    createdAt: row.created_at,
  };
}

function rowToRule(row: CorrelationRuleRow): ICorrelationRule {
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type as MarketEventType,
    sector: row.sector ?? undefined,
    ticker: row.ticker ?? undefined,
    direction: row.direction as CorrelationDirection,
    avgImpact: row.avg_impact,
    weight: row.weight,
    sampleCount: row.sample_count,
    hitCount: row.hit_count,
    missCount: row.miss_count,
    lastUpdated: row.last_updated,
    createdAt: row.created_at,
  };
}

function rowToPrediction(row: PredictionRow): IPrediction {
  return {
    id: row.id,
    userId: row.user_id,
    eventId: row.event_id,
    ticker: row.ticker,
    predictedDirection: row.predicted_direction as CorrelationDirection,
    predictedImpact: row.predicted_impact,
    confidence: row.confidence,
    actualDirection: (row.actual_direction as CorrelationDirection) ?? undefined,
    actualImpact: row.actual_impact ?? undefined,
    isCorrect: row.is_correct === null ? undefined : row.is_correct === 1,
    createdAt: row.created_at,
    verifiedAt: row.verified_at ?? undefined,
  };
}

// ─── Algorithm helpers ──────────────────────────────────────────────────────

/** Determine direction from a percent change value */
function classifyDirection(percentChange: number): CorrelationDirection {
  if (percentChange > 0.5) return 'bullish';
  if (percentChange < -0.5) return 'bearish';
  return 'neutral';
}

/** Time-decay multiplier: events older than 90 days get 0.5x weight */
const DECAY_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000;
function timeDecay(occurredAt: number): number {
  const age = Date.now() - occurredAt;
  return age > DECAY_THRESHOLD_MS ? 0.5 : 1.0;
}

/**
 * Bayesian weight (Laplace smoothing):
 *   weight = (hits + 1) / (samples + 2)
 * Range: ~0 to ~1, starts at 0.5 with no data
 */
function bayesianWeight(hits: number, samples: number): number {
  return (hits + 1) / (samples + 2);
}

// ─── Bridge initialisation ─────────────────────────────────────────────────

export function initCorrelationBridge(): void {
  const getUserId = () => {
    const db = getDatabase();
    const user = db.getSystemUser();
    return user?.id ?? 'system_default_user';
  };

  const getRawDb = () => {
    const db = getDatabase();
    return (db as any).db as import('better-sqlite3').Database;
  };

  // ── List market events ────────────────────────────────────────────────

  ipcBridge.correlation.listEvents.provider(async ({ limit, eventType }) => {
    const rawDb = getRawDb();
    const userId = getUserId();
    let sql = 'SELECT * FROM market_events WHERE user_id = ?';
    const params: unknown[] = [userId];

    if (eventType) {
      sql += ' AND event_type = ?';
      params.push(eventType);
    }
    sql += ' ORDER BY occurred_at DESC';
    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    const rows = rawDb.prepare(sql).all(...params) as MarketEventRow[];
    return rows.map((row) => {
      const cnt = rawDb.prepare('SELECT COUNT(*) as count FROM event_outcomes WHERE event_id = ?').get(row.id) as { count: number };
      return rowToEvent(row, cnt.count);
    });
  });

  // ── Create market event ───────────────────────────────────────────────

  ipcBridge.correlation.createEvent.provider(async (params) => {
    const rawDb = getRawDb();
    const userId = getUserId();
    const now = Date.now();
    const id = uuid();

    rawDb
      .prepare(
        'INSERT INTO market_events (id, user_id, event_type, title, description, tickers, sector, source, severity, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(id, userId, params.eventType, params.title, params.description ?? null, JSON.stringify(params.tickers), params.sector ?? null, params.source ?? null, params.severity, params.occurredAt, now);

    return rowToEvent(
      {
        id,
        user_id: userId,
        event_type: params.eventType,
        title: params.title,
        description: params.description ?? null,
        tickers: JSON.stringify(params.tickers),
        sector: params.sector ?? null,
        source: params.source ?? null,
        severity: params.severity,
        occurred_at: params.occurredAt,
        created_at: now,
      },
      0
    );
  });

  // ── Delete event ──────────────────────────────────────────────────────

  ipcBridge.correlation.deleteEvent.provider(async ({ id }) => {
    const rawDb = getRawDb();
    rawDb.prepare('DELETE FROM market_events WHERE id = ?').run(id);
  });

  // ── Record outcome (and auto-update rules) ───────────────────────────

  ipcBridge.correlation.recordOutcome.provider(async (params) => {
    const rawDb = getRawDb();
    const now = Date.now();
    const id = uuid();
    const percentChange = ((params.priceAfter - params.priceBefore) / params.priceBefore) * 100;

    rawDb
      .prepare('INSERT INTO event_outcomes (id, event_id, ticker, price_before, price_after, percent_change, measured_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, params.eventId, params.ticker, params.priceBefore, params.priceAfter, percentChange, params.measuredAt, now);

    const outcome = rowToOutcome({
      id,
      event_id: params.eventId,
      ticker: params.ticker,
      price_before: params.priceBefore,
      price_after: params.priceAfter,
      percent_change: percentChange,
      measured_at: params.measuredAt,
      created_at: now,
    });

    // Auto-update correlation rules based on this new data point
    updateRulesForOutcome(rawDb, getUserId(), params.eventId, params.ticker, percentChange);

    return outcome;
  });

  // ── List outcomes for an event ────────────────────────────────────────

  ipcBridge.correlation.listOutcomes.provider(async ({ eventId }) => {
    const rawDb = getRawDb();
    const rows = rawDb.prepare('SELECT * FROM event_outcomes WHERE event_id = ? ORDER BY created_at DESC').all(eventId) as EventOutcomeRow[];
    return rows.map(rowToOutcome);
  });

  // ── List learned rules ────────────────────────────────────────────────

  ipcBridge.correlation.listRules.provider(async ({ minWeight, eventType, ticker }) => {
    const rawDb = getRawDb();
    const userId = getUserId();
    let sql = 'SELECT * FROM correlation_rules WHERE user_id = ?';
    const params: unknown[] = [userId];

    if (minWeight !== undefined) {
      sql += ' AND weight >= ?';
      params.push(minWeight);
    }
    if (eventType) {
      sql += ' AND event_type = ?';
      params.push(eventType);
    }
    if (ticker) {
      sql += ' AND ticker = ?';
      params.push(ticker);
    }
    sql += ' ORDER BY weight DESC, sample_count DESC';

    const rows = rawDb.prepare(sql).all(...params) as CorrelationRuleRow[];
    return rows.map(rowToRule);
  });

  // ── Full recalculation of all rules ───────────────────────────────────

  ipcBridge.correlation.recalculateRules.provider(async () => {
    const rawDb = getRawDb();
    const userId = getUserId();
    const updated = recalculateAllRules(rawDb, userId);
    return { rulesUpdated: updated };
  });

  // ── Generate predictions for an event ─────────────────────────────────

  ipcBridge.correlation.generatePredictions.provider(async ({ eventId }) => {
    const rawDb = getRawDb();
    const userId = getUserId();
    const now = Date.now();

    // Get the event
    const event = rawDb.prepare('SELECT * FROM market_events WHERE id = ?').get(eventId) as MarketEventRow | undefined;
    if (!event) return [];

    const eventTickers = JSON.parse(event.tickers) as string[];
    const predictions: IPrediction[] = [];

    for (const ticker of eventTickers) {
      // Find matching rules: exact ticker match, sector match, or event-type-only match
      const matchingRules = rawDb
        .prepare(
          `SELECT * FROM correlation_rules WHERE user_id = ? AND event_type = ?
           AND (ticker = ? OR ticker IS NULL)
           AND (sector = ? OR sector IS NULL)
           AND sample_count > 0
           ORDER BY weight DESC`
        )
        .all(userId, event.event_type, ticker, event.sector ?? null) as CorrelationRuleRow[];

      if (matchingRules.length === 0) continue;

      // Weighted average of predictions
      let totalWeight = 0;
      let weightedImpact = 0;
      const directionVotes: Record<CorrelationDirection, number> = { bullish: 0, bearish: 0, neutral: 0 };

      for (const rule of matchingRules) {
        const w = rule.weight * (rule.ticker === ticker ? 1.5 : 1.0); // boost exact ticker matches
        totalWeight += w;
        weightedImpact += rule.avg_impact * w;
        directionVotes[rule.direction as CorrelationDirection] += w;
      }

      const predictedImpact = totalWeight > 0 ? weightedImpact / totalWeight : 0;
      const confidence = totalWeight > 0 ? Math.min(totalWeight / matchingRules.length, 1) : 0;

      // Determine predicted direction by weighted vote
      const predictedDirection = (Object.entries(directionVotes) as [CorrelationDirection, number][]).reduce((a, b) => (b[1] > a[1] ? b : a))[0];

      const predId = uuid();
      rawDb
        .prepare(
          'INSERT INTO predictions (id, user_id, event_id, ticker, predicted_direction, predicted_impact, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(predId, userId, eventId, ticker, predictedDirection, predictedImpact, confidence, now);

      predictions.push({
        id: predId,
        userId,
        eventId,
        ticker,
        predictedDirection,
        predictedImpact,
        confidence,
        createdAt: now,
      });
    }

    return predictions;
  });

  // ── List predictions ──────────────────────────────────────────────────

  ipcBridge.correlation.listPredictions.provider(async ({ limit, verifiedOnly }) => {
    const rawDb = getRawDb();
    const userId = getUserId();
    let sql = 'SELECT * FROM predictions WHERE user_id = ?';
    const params: unknown[] = [userId];

    if (verifiedOnly) {
      sql += ' AND is_correct IS NOT NULL';
    }
    sql += ' ORDER BY created_at DESC';
    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    const rows = rawDb.prepare(sql).all(...params) as PredictionRow[];
    return rows.map(rowToPrediction);
  });

  // ── Verify prediction (feedback loop) ─────────────────────────────────

  ipcBridge.correlation.verifyPrediction.provider(async (params) => {
    const rawDb = getRawDb();
    const now = Date.now();

    const pred = rawDb.prepare('SELECT * FROM predictions WHERE id = ?').get(params.predictionId) as PredictionRow | undefined;
    if (!pred) throw new Error('Prediction not found');

    const isCorrect = pred.predicted_direction === params.actualDirection ? 1 : 0;

    rawDb
      .prepare('UPDATE predictions SET actual_direction = ?, actual_impact = ?, is_correct = ?, verified_at = ? WHERE id = ?')
      .run(params.actualDirection, params.actualImpact, isCorrect, now, params.predictionId);

    // Update rules based on verification
    const event = rawDb.prepare('SELECT * FROM market_events WHERE id = ?').get(pred.event_id) as MarketEventRow | undefined;
    if (event) {
      updateRulesFromVerification(rawDb, pred.user_id, event.event_type, event.sector, pred.ticker, isCorrect === 1);
    }

    const updated = rawDb.prepare('SELECT * FROM predictions WHERE id = ?').get(params.predictionId) as PredictionRow;
    const prediction = rowToPrediction(updated);

    ipcBridge.correlation.onPredictionVerified.emit(prediction);
    return prediction;
  });

  // ── Get stats ─────────────────────────────────────────────────────────

  ipcBridge.correlation.getStats.provider(async () => {
    const rawDb = getRawDb();
    const userId = getUserId();

    const totalEvents = (rawDb.prepare('SELECT COUNT(*) as count FROM market_events WHERE user_id = ?').get(userId) as { count: number }).count;
    const totalPredictions = (rawDb.prepare('SELECT COUNT(*) as count FROM predictions WHERE user_id = ?').get(userId) as { count: number }).count;
    const verifiedPredictions = (rawDb.prepare('SELECT COUNT(*) as count FROM predictions WHERE user_id = ? AND is_correct IS NOT NULL').get(userId) as { count: number }).count;
    const correctPredictions = (rawDb.prepare('SELECT COUNT(*) as count FROM predictions WHERE user_id = ? AND is_correct = 1').get(userId) as { count: number }).count;

    const accuracy = verifiedPredictions > 0 ? correctPredictions / verifiedPredictions : 0;

    // Recent accuracy (last 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentVerified = (rawDb.prepare('SELECT COUNT(*) as count FROM predictions WHERE user_id = ? AND is_correct IS NOT NULL AND created_at > ?').get(userId, thirtyDaysAgo) as { count: number }).count;
    const recentCorrect = (rawDb.prepare('SELECT COUNT(*) as count FROM predictions WHERE user_id = ? AND is_correct = 1 AND created_at > ?').get(userId, thirtyDaysAgo) as { count: number }).count;
    const recentAccuracy = recentVerified > 0 ? recentCorrect / recentVerified : 0;

    // Top 5 rules by weight
    const topRuleRows = rawDb.prepare('SELECT * FROM correlation_rules WHERE user_id = ? ORDER BY weight DESC, sample_count DESC LIMIT 5').all(userId) as CorrelationRuleRow[];

    return {
      totalEvents,
      totalPredictions,
      verifiedPredictions,
      accuracy,
      topRules: topRuleRows.map(rowToRule),
      recentAccuracy,
    } satisfies ICorrelationStats;
  });
}

// ─── Self-learning algorithm functions ──────────────────────────────────────

/**
 * Update correlation rules when a new outcome is recorded.
 * Finds or creates a rule for the (event_type, sector, ticker) tuple
 * and updates it with the new data point.
 */
function updateRulesForOutcome(
  rawDb: import('better-sqlite3').Database,
  userId: string,
  eventId: string,
  ticker: string,
  percentChange: number
): void {
  const event = rawDb.prepare('SELECT * FROM market_events WHERE id = ?').get(eventId) as MarketEventRow | undefined;
  if (!event) return;

  const now = Date.now();
  const direction = classifyDirection(percentChange);
  const decay = timeDecay(event.occurred_at);

  // Update or create rule for (event_type, sector, ticker) specificity levels:
  // 1. Most specific: event_type + sector + ticker
  // 2. Mid specific: event_type + sector
  // 3. Broadest: event_type only
  const combos: Array<{ sector: string | null; ticker: string | null }> = [
    { sector: event.sector, ticker },
    { sector: event.sector, ticker: null },
    { sector: null, ticker: null },
  ];

  for (const combo of combos) {
    const existing = rawDb
      .prepare(
        'SELECT * FROM correlation_rules WHERE user_id = ? AND event_type = ? AND (sector IS ? OR (sector IS NULL AND ? IS NULL)) AND (ticker IS ? OR (ticker IS NULL AND ? IS NULL))'
      )
      .get(userId, event.event_type, combo.sector, combo.sector, combo.ticker, combo.ticker) as CorrelationRuleRow | undefined;

    if (existing) {
      // Update existing rule with new data point
      const newSampleCount = existing.sample_count + 1;
      const isHit = direction === existing.direction;
      const newHitCount = existing.hit_count + (isHit ? 1 : 0);
      const newMissCount = existing.miss_count + (isHit ? 0 : 1);

      // Weighted running average for impact (with time decay)
      const newAvgImpact = (existing.avg_impact * existing.sample_count + percentChange * decay) / newSampleCount;

      // Bayesian weight update
      const newWeight = bayesianWeight(newHitCount, newSampleCount);

      // If the predominant direction changes, flip it
      const newDirection = newSampleCount > 2 ? (newHitCount > newMissCount ? existing.direction : direction) : existing.direction;

      rawDb
        .prepare(
          'UPDATE correlation_rules SET direction = ?, avg_impact = ?, weight = ?, sample_count = ?, hit_count = ?, miss_count = ?, last_updated = ? WHERE id = ?'
        )
        .run(newDirection, newAvgImpact, newWeight, newSampleCount, newHitCount, newMissCount, now, existing.id);

      const updatedRow = rawDb.prepare('SELECT * FROM correlation_rules WHERE id = ?').get(existing.id) as CorrelationRuleRow;
      ipcBridge.correlation.onRuleUpdated.emit(rowToRule(updatedRow));
    } else {
      // Create new rule
      const id = uuid();
      rawDb
        .prepare(
          'INSERT INTO correlation_rules (id, user_id, event_type, sector, ticker, direction, avg_impact, weight, sample_count, hit_count, miss_count, last_updated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(id, userId, event.event_type, combo.sector, combo.ticker, direction, percentChange * decay, 0.5, 1, 1, 0, now, now);

      const newRow = rawDb.prepare('SELECT * FROM correlation_rules WHERE id = ?').get(id) as CorrelationRuleRow;
      ipcBridge.correlation.onRuleUpdated.emit(rowToRule(newRow));
    }
  }
}

/**
 * Update rules from prediction verification (feedback loop).
 * Adjusts hit/miss counts for matching rules based on whether the prediction was correct.
 */
function updateRulesFromVerification(
  rawDb: import('better-sqlite3').Database,
  userId: string,
  eventType: string,
  sector: string | null,
  ticker: string,
  wasCorrect: boolean
): void {
  const now = Date.now();

  // Find all rules that could have contributed to this prediction
  const matchingRules = rawDb
    .prepare(
      `SELECT * FROM correlation_rules WHERE user_id = ? AND event_type = ?
       AND (ticker = ? OR ticker IS NULL)
       AND (sector = ? OR sector IS NULL)`
    )
    .all(userId, eventType, ticker, sector) as CorrelationRuleRow[];

  for (const rule of matchingRules) {
    const newHitCount = rule.hit_count + (wasCorrect ? 1 : 0);
    const newMissCount = rule.miss_count + (wasCorrect ? 0 : 1);
    const newSampleCount = rule.sample_count + 1;
    const newWeight = bayesianWeight(newHitCount, newSampleCount);

    rawDb
      .prepare('UPDATE correlation_rules SET hit_count = ?, miss_count = ?, sample_count = ?, weight = ?, last_updated = ? WHERE id = ?')
      .run(newHitCount, newMissCount, newSampleCount, newWeight, now, rule.id);

    const updatedRow = rawDb.prepare('SELECT * FROM correlation_rules WHERE id = ?').get(rule.id) as CorrelationRuleRow;
    ipcBridge.correlation.onRuleUpdated.emit(rowToRule(updatedRow));
  }
}

/**
 * Full recalculation: rebuild all rule stats from raw outcome data.
 * Useful after importing historical data or to fix drift.
 */
function recalculateAllRules(rawDb: import('better-sqlite3').Database, userId: string): number {
  const now = Date.now();

  // Get all outcomes joined with their events
  const outcomes = rawDb
    .prepare(
      `SELECT o.*, e.event_type, e.sector, e.occurred_at
       FROM event_outcomes o
       JOIN market_events e ON o.event_id = e.id
       WHERE e.user_id = ?
       ORDER BY o.created_at ASC`
    )
    .all(userId) as (EventOutcomeRow & { event_type: string; sector: string | null; occurred_at: number })[];

  // Delete all existing rules for this user and rebuild
  rawDb.prepare('DELETE FROM correlation_rules WHERE user_id = ?').run(userId);

  // Aggregate by (event_type, sector, ticker) at multiple specificity levels
  const ruleMap = new Map<
    string,
    {
      eventType: string;
      sector: string | null;
      ticker: string | null;
      impacts: { value: number; decay: number; direction: CorrelationDirection }[];
    }
  >();

  for (const o of outcomes) {
    const direction = classifyDirection(o.percent_change);
    const decay = timeDecay(o.occurred_at);

    // Three specificity levels
    const keys = [
      `${o.event_type}|${o.sector ?? ''}|${o.ticker}`,
      `${o.event_type}|${o.sector ?? ''}|`,
      `${o.event_type}||`,
    ];
    const combos = [
      { sector: o.sector, ticker: o.ticker },
      { sector: o.sector, ticker: null },
      { sector: null, ticker: null },
    ];

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!ruleMap.has(key)) {
        ruleMap.set(key, { eventType: o.event_type, sector: combos[i].sector, ticker: combos[i].ticker, impacts: [] });
      }
      ruleMap.get(key)!.impacts.push({ value: o.percent_change, decay, direction });
    }
  }

  let rulesCreated = 0;

  for (const [, data] of ruleMap) {
    if (data.impacts.length === 0) continue;

    // Determine dominant direction
    const dirCounts: Record<CorrelationDirection, number> = { bullish: 0, bearish: 0, neutral: 0 };
    let totalImpact = 0;
    let totalDecay = 0;

    for (const imp of data.impacts) {
      dirCounts[imp.direction] += imp.decay;
      totalImpact += imp.value * imp.decay;
      totalDecay += imp.decay;
    }

    const direction = (Object.entries(dirCounts) as [CorrelationDirection, number][]).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    const avgImpact = totalDecay > 0 ? totalImpact / totalDecay : 0;

    // Count hits (outcomes matching dominant direction)
    const hits = data.impacts.filter((i) => i.direction === direction).length;
    const samples = data.impacts.length;
    const weight = bayesianWeight(hits, samples);

    const id = uuid();
    rawDb
      .prepare(
        'INSERT INTO correlation_rules (id, user_id, event_type, sector, ticker, direction, avg_impact, weight, sample_count, hit_count, miss_count, last_updated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(id, userId, data.eventType, data.sector, data.ticker, direction, avgImpact, weight, samples, hits, samples - hits, now, now);

    rulesCreated++;
  }

  return rulesCreated;
}
