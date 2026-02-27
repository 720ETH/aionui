/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IStockAgent } from '@/common/ipcBridge';
import { Button, Card, Popconfirm, Tag, Tooltip } from '@arco-design/web-react';
import { Analysis, DeleteOne, EditTwo, Play } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type StockAgentCardProps = {
  agent: IStockAgent;
  onEdit: (agent: IStockAgent) => void;
  onDelete: (id: string) => void;
  onRun: (id: string) => void;
  onViewReports: (agent: IStockAgent) => void;
};

const StockAgentCard: React.FC<StockAgentCardProps> = ({ agent, onEdit, onDelete, onRun, onViewReports }) => {
  const { t } = useTranslation();

  const formatTime = (ts?: number) => {
    if (!ts) return t('stockAgent.card.never');
    return new Date(ts).toLocaleString();
  };

  return (
    <Card
      className='stock-agent-card rd-12px'
      hoverable
      title={
        <div className='flex items-center gap-8px'>
          <span className='text-16px font-medium'>{agent.name}</span>
          <Tag color={agent.enabled ? 'green' : 'gray'} size='small'>
            {agent.enabled ? t('stockAgent.status.active') : t('stockAgent.status.paused')}
          </Tag>
        </div>
      }
      extra={
        <div className='flex items-center gap-4px'>
          <Tooltip content={t('stockAgent.card.runNow')}>
            <Button type='text' size='mini' icon={<Play theme='outline' size={14} />} onClick={() => onRun(agent.id)} />
          </Tooltip>
          <Tooltip content={t('stockAgent.card.edit')}>
            <Button type='text' size='mini' icon={<EditTwo theme='outline' size={14} />} onClick={() => onEdit(agent)} />
          </Tooltip>
          <Popconfirm title={t('stockAgent.deleteConfirm')} onOk={() => onDelete(agent.id)}>
            <Tooltip content={t('stockAgent.card.delete')}>
              <Button type='text' size='mini' status='danger' icon={<DeleteOne theme='outline' size={14} />} />
            </Tooltip>
          </Popconfirm>
        </div>
      }
    >
      <div className='flex flex-col gap-12px'>
        {/* Tickers */}
        <div className='flex flex-wrap gap-6px'>
          {agent.tickers.map((ticker) => (
            <Tag key={ticker} color='arcoblue' size='small'>
              {ticker}
            </Tag>
          ))}
        </div>

        {/* Prompt preview */}
        <div className='text-13px text-t-secondary line-clamp-2'>{agent.prompt}</div>

        {/* Meta info */}
        <div className='flex items-center justify-between text-12px text-t-tertiary'>
          <span>
            {t('stockAgent.card.lastRun')}: {formatTime(agent.lastRunAt)}
          </span>
          <Button type='text' size='mini' icon={<Analysis theme='outline' size={14} />} onClick={() => onViewReports(agent)}>
            {t('stockAgent.card.reports', { count: agent.reportCount })}
          </Button>
        </div>

        {/* Schedule */}
        {agent.scheduleCron && (
          <div className='text-12px text-t-tertiary'>
            <code className='bg-2 px-6px py-2px rd-4px'>{agent.scheduleCron}</code>
          </div>
        )}
      </div>
    </Card>
  );
};

export default StockAgentCard;
