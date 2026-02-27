/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICorrelationRule } from '@/common/ipcBridge';
import { Button, Empty, Message, Progress, Spin, Tag } from '@arco-design/web-react';
import { Refresh } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCorrelationRules } from '../hooks/useCorrelation';

const directionColorMap: Record<string, string> = {
  bullish: 'green',
  bearish: 'red',
  neutral: 'gray',
};

const InsightsTab: React.FC = () => {
  const { t } = useTranslation();
  const { rules, loading, recalculate } = useCorrelationRules();

  const handleRecalculate = async () => {
    try {
      const result = await recalculate();
      Message.success(t('correlation.rulesRecalculated', { count: result.rulesUpdated }));
    } catch (err) {
      Message.error(String(err));
    }
  };

  if (loading) {
    return (
      <div className='flex justify-center py-40px'>
        <Spin />
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-16px'>
      <div className='flex items-center justify-between'>
        <span className='text-14px text-t-secondary'>{t('correlation.insights.subtitle', { count: rules.length })}</span>
        <Button type='text' size='small' icon={<Refresh theme='outline' size={14} />} onClick={handleRecalculate}>
          {t('correlation.insights.recalculate')}
        </Button>
      </div>

      {rules.length === 0 ? (
        <Empty description={t('correlation.insights.empty')} />
      ) : (
        <div className='flex flex-col gap-12px'>
          {rules.map((rule) => (
            <RuleCard key={rule.id} rule={rule} />
          ))}
        </div>
      )}
    </div>
  );
};

const RuleCard: React.FC<{ rule: ICorrelationRule }> = ({ rule }) => {
  const { t } = useTranslation();
  const accuracyPercent = Math.round(rule.weight * 100);

  return (
    <div className='bg-2 rd-12px p-16px flex flex-col gap-8px'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-8px'>
          <Tag color='arcoblue' size='small'>
            {t(`correlation.eventType.${rule.eventType}`)}
          </Tag>
          {rule.sector && (
            <Tag color='purple' size='small'>
              {rule.sector}
            </Tag>
          )}
          {rule.ticker && (
            <Tag color='orangered' size='small'>
              {rule.ticker}
            </Tag>
          )}
        </div>
        <Tag color={directionColorMap[rule.direction] ?? 'gray'} size='small'>
          {t(`correlation.direction.${rule.direction}`)}
        </Tag>
      </div>

      <div className='flex items-center gap-16px text-13px'>
        <span className='text-t-secondary'>
          {t('correlation.insights.avgImpact')}: <span className={rule.avgImpact >= 0 ? 'text-[#00b42a]' : 'text-[#f53f3f]'}>{rule.avgImpact >= 0 ? '+' : ''}{rule.avgImpact.toFixed(2)}%</span>
        </span>
        <span className='text-t-tertiary'>
          {t('correlation.insights.samples')}: {rule.sampleCount}
        </span>
        <span className='text-t-tertiary'>
          {rule.hitCount}W / {rule.missCount}L
        </span>
      </div>

      <div className='flex items-center gap-8px'>
        <span className='text-12px text-t-tertiary w-80px'>{t('correlation.insights.confidence')}</span>
        <Progress percent={accuracyPercent} size='small' color={accuracyPercent >= 60 ? '#00b42a' : accuracyPercent >= 40 ? '#ff7d00' : '#f53f3f'} style={{ flex: 1 }} />
        <span className='text-12px text-t-secondary w-40px text-right'>{accuracyPercent}%</span>
      </div>
    </div>
  );
};

export default InsightsTab;
