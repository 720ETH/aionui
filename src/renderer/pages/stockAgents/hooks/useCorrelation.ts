/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  IMarketEvent,
  IEventOutcome,
  ICorrelationRule,
  IPrediction,
  ICorrelationStats,
  ICreateMarketEventParams,
  IRecordOutcomeParams,
  IVerifyPredictionParams,
  MarketEventType,
} from '@/common/ipcBridge';
import useSWR, { mutate } from 'swr';
import { useCallback } from 'react';

const EVENTS_KEY = 'correlation.events';
const RULES_KEY = 'correlation.rules';
const PREDICTIONS_KEY = 'correlation.predictions';
const STATS_KEY = 'correlation.stats';

export function useMarketEvents(eventType?: MarketEventType) {
  const key = eventType ? `${EVENTS_KEY}.${eventType}` : EVENTS_KEY;
  const { data: events, isLoading, error } = useSWR<IMarketEvent[]>(key, () => ipcBridge.correlation.listEvents.invoke({ limit: 100, eventType }));

  const createEvent = useCallback(async (params: ICreateMarketEventParams) => {
    const event = await ipcBridge.correlation.createEvent.invoke(params);
    await mutate(EVENTS_KEY);
    await mutate(STATS_KEY);
    return event;
  }, []);

  const deleteEvent = useCallback(async (id: string) => {
    await ipcBridge.correlation.deleteEvent.invoke({ id });
    await mutate(EVENTS_KEY);
    await mutate(STATS_KEY);
  }, []);

  return { events: events || [], loading: isLoading, error, createEvent, deleteEvent };
}

export function useEventOutcomes(eventId: string | null) {
  const key = eventId ? `correlation.outcomes.${eventId}` : null;
  const { data: outcomes, isLoading } = useSWR<IEventOutcome[]>(key, () => (eventId ? ipcBridge.correlation.listOutcomes.invoke({ eventId }) : Promise.resolve([])));

  const recordOutcome = useCallback(
    async (params: Omit<IRecordOutcomeParams, 'eventId'>) => {
      if (!eventId) return;
      const outcome = await ipcBridge.correlation.recordOutcome.invoke({ ...params, eventId });
      await mutate(key);
      await mutate(RULES_KEY);
      await mutate(STATS_KEY);
      return outcome;
    },
    [eventId, key]
  );

  return { outcomes: outcomes || [], loading: isLoading, recordOutcome };
}

export function useCorrelationRules(filters?: { minWeight?: number; eventType?: MarketEventType; ticker?: string }) {
  const filterKey = filters ? JSON.stringify(filters) : '';
  const key = `${RULES_KEY}.${filterKey}`;
  const { data: rules, isLoading, error } = useSWR<ICorrelationRule[]>(key, () => ipcBridge.correlation.listRules.invoke(filters ?? {}));

  const recalculate = useCallback(async () => {
    const result = await ipcBridge.correlation.recalculateRules.invoke();
    await mutate((k) => typeof k === 'string' && k.startsWith(RULES_KEY), undefined, { revalidate: true });
    await mutate(STATS_KEY);
    return result;
  }, []);

  return { rules: rules || [], loading: isLoading, error, recalculate };
}

export function usePredictions(verifiedOnly?: boolean) {
  const key = verifiedOnly ? `${PREDICTIONS_KEY}.verified` : PREDICTIONS_KEY;
  const { data: predictions, isLoading, error } = useSWR<IPrediction[]>(key, () => ipcBridge.correlation.listPredictions.invoke({ limit: 100, verifiedOnly }));

  const generatePredictions = useCallback(async (eventId: string) => {
    const preds = await ipcBridge.correlation.generatePredictions.invoke({ eventId });
    await mutate(PREDICTIONS_KEY);
    await mutate(STATS_KEY);
    return preds;
  }, []);

  const verifyPrediction = useCallback(async (params: IVerifyPredictionParams) => {
    const pred = await ipcBridge.correlation.verifyPrediction.invoke(params);
    await mutate(PREDICTIONS_KEY);
    await mutate(`${PREDICTIONS_KEY}.verified`);
    await mutate((k) => typeof k === 'string' && k.startsWith(RULES_KEY), undefined, { revalidate: true });
    await mutate(STATS_KEY);
    return pred;
  }, []);

  return { predictions: predictions || [], loading: isLoading, error, generatePredictions, verifyPrediction };
}

export function useCorrelationStats() {
  const { data: stats, isLoading } = useSWR<ICorrelationStats>(STATS_KEY, () => ipcBridge.correlation.getStats.invoke());

  return { stats: stats ?? null, loading: isLoading };
}
