/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IStockAgent, ICreateStockAgentParams } from '@/common/ipcBridge';
import { Button, Empty, Message, Spin } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import StockAgentCard from './components/StockAgentCard';
import StockAgentForm from './components/StockAgentForm';
import StockReportDrawer from './components/StockReportDrawer';
import { useStockAgents } from './hooks/useStockAgents';

const StockAgentsPage: React.FC = () => {
  const { t } = useTranslation();
  const { agents, loading, createAgent, updateAgent, deleteAgent, runAgent } = useStockAgents();

  // Form drawer state
  const [formVisible, setFormVisible] = useState(false);
  const [editingAgent, setEditingAgent] = useState<IStockAgent | null>(null);

  // Report drawer state
  const [reportVisible, setReportVisible] = useState(false);
  const [reportAgent, setReportAgent] = useState<IStockAgent | null>(null);

  const handleCreate = useCallback(() => {
    setEditingAgent(null);
    setFormVisible(true);
  }, []);

  const handleEdit = useCallback((agent: IStockAgent) => {
    setEditingAgent(agent);
    setFormVisible(true);
  }, []);

  const handleFormSave = useCallback(
    async (params: ICreateStockAgentParams) => {
      if (editingAgent) {
        await updateAgent(editingAgent.id, params);
      } else {
        await createAgent(params);
      }
    },
    [editingAgent, createAgent, updateAgent]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteAgent(id);
        Message.success(t('stockAgent.deleteSuccess'));
      } catch (err) {
        Message.error(String(err));
      }
    },
    [deleteAgent, t]
  );

  const handleRun = useCallback(
    async (id: string) => {
      try {
        await runAgent(id);
        Message.success(t('stockAgent.runSuccess'));
      } catch (err) {
        Message.error(t('stockAgent.runFailed'));
      }
    },
    [runAgent, t]
  );

  const handleViewReports = useCallback((agent: IStockAgent) => {
    setReportAgent(agent);
    setReportVisible(true);
  }, []);

  if (loading) {
    return (
      <div className='flex justify-center items-center h-full'>
        <Spin size={32} />
      </div>
    );
  }

  return (
    <div className='w-full min-h-full box-border overflow-y-auto px-12px md:px-40px py-32px'>
      <div className='mx-auto w-full md:max-w-1024px'>
        {/* Header */}
        <div className='flex items-center justify-between mb-24px'>
          <div>
            <h1 className='text-24px font-bold text-t-primary m-0'>{t('stockAgent.page.title')}</h1>
            <p className='text-14px text-t-secondary mt-4px mb-0'>{t('stockAgent.page.subtitle')}</p>
          </div>
          <Button type='primary' icon={<Plus theme='outline' size={16} />} onClick={handleCreate}>
            {t('common.create')}
          </Button>
        </div>

        {/* Agent list */}
        {agents.length === 0 ? (
          <div className='py-80px'>
            <Empty
              description={
                <div className='flex flex-col items-center gap-8px'>
                  <span>{t('stockAgent.page.empty')}</span>
                  <span className='text-12px text-t-tertiary'>{t('stockAgent.page.emptyHint')}</span>
                </div>
              }
            />
          </div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-16px'>
            {agents.map((agent) => (
              <StockAgentCard key={agent.id} agent={agent} onEdit={handleEdit} onDelete={handleDelete} onRun={handleRun} onViewReports={handleViewReports} />
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit drawer */}
      <StockAgentForm visible={formVisible} agent={editingAgent} onClose={() => setFormVisible(false)} onSave={handleFormSave} />

      {/* Reports drawer */}
      <StockReportDrawer visible={reportVisible} agent={reportAgent} onClose={() => setReportVisible(false)} />
    </div>
  );
};

export default StockAgentsPage;
