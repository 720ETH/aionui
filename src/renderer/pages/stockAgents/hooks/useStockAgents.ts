/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IStockAgent, IStockReport, ICreateStockAgentParams } from '@/common/ipcBridge';
import useSWR, { mutate } from 'swr';
import { useCallback } from 'react';

const AGENTS_KEY = 'stockAgents.list';

export function useStockAgents() {
  const { data: agents, isLoading, error } = useSWR<IStockAgent[]>(AGENTS_KEY, () => ipcBridge.stockAgent.list.invoke());

  const createAgent = useCallback(async (params: ICreateStockAgentParams) => {
    const agent = await ipcBridge.stockAgent.create.invoke(params);
    await mutate(AGENTS_KEY);
    return agent;
  }, []);

  const updateAgent = useCallback(async (id: string, updates: Partial<ICreateStockAgentParams>) => {
    const agent = await ipcBridge.stockAgent.update.invoke({ id, updates });
    await mutate(AGENTS_KEY);
    return agent;
  }, []);

  const deleteAgent = useCallback(async (id: string) => {
    await ipcBridge.stockAgent.remove.invoke({ id });
    await mutate(AGENTS_KEY);
  }, []);

  const runAgent = useCallback(async (agentId: string) => {
    const report = await ipcBridge.stockAgent.createReport.invoke({ agentId });
    await mutate(AGENTS_KEY);
    return report;
  }, []);

  return {
    agents: agents || [],
    loading: isLoading,
    error,
    createAgent,
    updateAgent,
    deleteAgent,
    runAgent,
  };
}

export function useStockReports(agentId: string | null) {
  const key = agentId ? `stockAgents.reports.${agentId}` : null;
  const { data: reports, isLoading } = useSWR<IStockReport[]>(key, () => (agentId ? ipcBridge.stockAgent.listReports.invoke({ agentId }) : Promise.resolve([])));

  return {
    reports: reports || [],
    loading: isLoading,
  };
}
