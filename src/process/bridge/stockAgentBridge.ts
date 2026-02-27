/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '../../common';
import type { IStockAgent, IStockReport } from '../../common/ipcBridge';
import { getDatabase } from '@process/database';
import { uuid } from '../../common/utils';

interface StockAgentRow {
  id: string;
  user_id: string;
  name: string;
  tickers: string;
  prompt: string;
  schedule_cron: string | null;
  enabled: number;
  created_at: number;
  updated_at: number;
}

interface StockReportRow {
  id: string;
  agent_id: string;
  status: string;
  summary: string | null;
  raw_content: string | null;
  error_message: string | null;
  created_at: number;
}

function rowToAgent(row: StockAgentRow, reportCount: number, lastRunAt?: number): IStockAgent {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    tickers: JSON.parse(row.tickers) as string[],
    prompt: row.prompt,
    scheduleCron: row.schedule_cron ?? undefined,
    enabled: row.enabled === 1,
    reportCount,
    lastRunAt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToReport(row: StockReportRow): IStockReport {
  return {
    id: row.id,
    agentId: row.agent_id,
    status: row.status as IStockReport['status'],
    summary: row.summary ?? undefined,
    rawContent: row.raw_content ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Initialize stock agent IPC bridge handlers
 */
export function initStockAgentBridge(): void {
  const getUserId = () => {
    const db = getDatabase();
    const user = db.getSystemUser();
    return user?.id ?? 'system_default_user';
  };

  // List all agents
  ipcBridge.stockAgent.list.provider(async () => {
    const db = getDatabase();
    const userId = getUserId();
    const rawDb = (db as any).db as import('better-sqlite3').Database;
    const rows = rawDb.prepare('SELECT * FROM stock_agents WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as StockAgentRow[];

    return rows.map((row) => {
      const countResult = rawDb.prepare('SELECT COUNT(*) as count FROM stock_reports WHERE agent_id = ?').get(row.id) as { count: number };
      const lastReport = rawDb.prepare('SELECT created_at FROM stock_reports WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1').get(row.id) as { created_at: number } | undefined;
      return rowToAgent(row, countResult.count, lastReport?.created_at);
    });
  });

  // Get single agent
  ipcBridge.stockAgent.get.provider(async ({ id }) => {
    const db = getDatabase();
    const rawDb = (db as any).db as import('better-sqlite3').Database;
    const row = rawDb.prepare('SELECT * FROM stock_agents WHERE id = ?').get(id) as StockAgentRow | undefined;
    if (!row) return null;
    const countResult = rawDb.prepare('SELECT COUNT(*) as count FROM stock_reports WHERE agent_id = ?').get(row.id) as { count: number };
    const lastReport = rawDb.prepare('SELECT created_at FROM stock_reports WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1').get(row.id) as { created_at: number } | undefined;
    return rowToAgent(row, countResult.count, lastReport?.created_at);
  });

  // Create agent
  ipcBridge.stockAgent.create.provider(async (params) => {
    const db = getDatabase();
    const userId = getUserId();
    const rawDb = (db as any).db as import('better-sqlite3').Database;
    const now = Date.now();
    const id = uuid();

    rawDb
      .prepare('INSERT INTO stock_agents (id, user_id, name, tickers, prompt, schedule_cron, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, userId, params.name, JSON.stringify(params.tickers), params.prompt, params.scheduleCron ?? null, params.enabled !== false ? 1 : 0, now, now);

    const agent = rowToAgent(
      { id, user_id: userId, name: params.name, tickers: JSON.stringify(params.tickers), prompt: params.prompt, schedule_cron: params.scheduleCron ?? null, enabled: params.enabled !== false ? 1 : 0, created_at: now, updated_at: now },
      0,
      undefined
    );
    ipcBridge.stockAgent.onAgentUpdated.emit(agent);
    return agent;
  });

  // Update agent
  ipcBridge.stockAgent.update.provider(async ({ id, updates }) => {
    const db = getDatabase();
    const rawDb = (db as any).db as import('better-sqlite3').Database;
    const now = Date.now();

    const sets: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.name !== undefined) {
      sets.push('name = ?');
      values.push(updates.name);
    }
    if (updates.tickers !== undefined) {
      sets.push('tickers = ?');
      values.push(JSON.stringify(updates.tickers));
    }
    if (updates.prompt !== undefined) {
      sets.push('prompt = ?');
      values.push(updates.prompt);
    }
    if (updates.scheduleCron !== undefined) {
      sets.push('schedule_cron = ?');
      values.push(updates.scheduleCron);
    }
    if (updates.enabled !== undefined) {
      sets.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }

    values.push(id);
    rawDb.prepare(`UPDATE stock_agents SET ${sets.join(', ')} WHERE id = ?`).run(...values);

    const row = rawDb.prepare('SELECT * FROM stock_agents WHERE id = ?').get(id) as StockAgentRow;
    const countResult = rawDb.prepare('SELECT COUNT(*) as count FROM stock_reports WHERE agent_id = ?').get(id) as { count: number };
    const lastReport = rawDb.prepare('SELECT created_at FROM stock_reports WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1').get(id) as { created_at: number } | undefined;
    const agent = rowToAgent(row, countResult.count, lastReport?.created_at);
    ipcBridge.stockAgent.onAgentUpdated.emit(agent);
    return agent;
  });

  // Remove agent
  ipcBridge.stockAgent.remove.provider(async ({ id }) => {
    const db = getDatabase();
    const rawDb = (db as any).db as import('better-sqlite3').Database;
    rawDb.prepare('DELETE FROM stock_agents WHERE id = ?').run(id);
  });

  // List reports for agent
  ipcBridge.stockAgent.listReports.provider(async ({ agentId }) => {
    const db = getDatabase();
    const rawDb = (db as any).db as import('better-sqlite3').Database;
    const rows = rawDb.prepare('SELECT * FROM stock_reports WHERE agent_id = ? ORDER BY created_at DESC').all(agentId) as StockReportRow[];
    return rows.map(rowToReport);
  });

  // Create a new report (triggered by "Run Now")
  ipcBridge.stockAgent.createReport.provider(async ({ agentId }) => {
    const db = getDatabase();
    const rawDb = (db as any).db as import('better-sqlite3').Database;
    const now = Date.now();
    const id = uuid();

    rawDb.prepare('INSERT INTO stock_reports (id, agent_id, status, summary, raw_content, error_message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, agentId, 'pending', null, null, null, now);

    const report: IStockReport = { id, agentId, status: 'pending', createdAt: now };
    ipcBridge.stockAgent.onReportCreated.emit(report);
    return report;
  });

  // Update report
  ipcBridge.stockAgent.updateReport.provider(async ({ id, updates }) => {
    const db = getDatabase();
    const rawDb = (db as any).db as import('better-sqlite3').Database;

    const sets: string[] = [];
    const values: unknown[] = [];

    if (updates.status !== undefined) {
      sets.push('status = ?');
      values.push(updates.status);
    }
    if (updates.summary !== undefined) {
      sets.push('summary = ?');
      values.push(updates.summary);
    }
    if (updates.rawContent !== undefined) {
      sets.push('raw_content = ?');
      values.push(updates.rawContent);
    }
    if (updates.errorMessage !== undefined) {
      sets.push('error_message = ?');
      values.push(updates.errorMessage);
    }

    if (sets.length > 0) {
      values.push(id);
      rawDb.prepare(`UPDATE stock_reports SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    }

    const row = rawDb.prepare('SELECT * FROM stock_reports WHERE id = ?').get(id) as StockReportRow;
    return rowToReport(row);
  });
}
