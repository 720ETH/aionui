/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMarketEvent } from '@/common/ipcBridge';
import { Button, Empty, Message, Popconfirm, Spin, Tag, Tabs } from '@arco-design/web-react';
import { DeleteOne, Lightning, Plus, TrendingUp } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCorrelationStats, useMarketEvents, usePredictions } from '../hooks/useCorrelation';
import EventForm from './EventForm';
import InsightsTab from './InsightsTab';
import PredictionsTab from './PredictionsTab';

const TabPane = Tabs.TabPane;

const severityColors = ['', 'gray', 'gold', 'orange', 'orangered', 'red'];

const CorrelationPanel: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('events');
  const [eventFormVisible, setEventFormVisible] = useState(false);
  const { createEvent } = useMarketEvents();

  const handleCreateEvent = useCallback(async (params: import('@/common/ipcBridge').ICreateMarketEventParams) => {
    await createEvent(params);
  }, [createEvent]);

  return (
    <div className='flex flex-col gap-16px'>
      {/* Stats bar */}
      <StatsBar />

      {/* Tabbed content */}
      <Tabs activeTab={activeTab} onChange={setActiveTab} type='rounded'>
        <TabPane key='events' title={t('correlation.tabs.events')}>
          <EventsTab onCreateEvent={() => setEventFormVisible(true)} />
        </TabPane>
        <TabPane key='insights' title={t('correlation.tabs.insights')}>
          <InsightsTab />
        </TabPane>
        <TabPane key='predictions' title={t('correlation.tabs.predictions')}>
          <PredictionsTab />
        </TabPane>
      </Tabs>

      <EventForm visible={eventFormVisible} onClose={() => setEventFormVisible(false)} onSave={handleCreateEvent} />
    </div>
  );
};

/** Top-level stats summary bar */
const StatsBar: React.FC = () => {
  const { t } = useTranslation();
  const { stats, loading } = useCorrelationStats();

  if (loading || !stats) return null;

  return (
    <div className='flex items-center gap-24px bg-2 rd-12px px-20px py-14px'>
      <StatItem label={t('correlation.stats.events')} value={stats.totalEvents} />
      <StatItem label={t('correlation.stats.predictions')} value={stats.totalPredictions} />
      <StatItem label={t('correlation.stats.verified')} value={stats.verifiedPredictions} />
      <StatItem
        label={t('correlation.stats.accuracy')}
        value={`${Math.round(stats.accuracy * 100)}%`}
        color={stats.accuracy >= 0.6 ? '#00b42a' : stats.accuracy >= 0.4 ? '#ff7d00' : '#f53f3f'}
      />
      <StatItem
        label={t('correlation.stats.recentAccuracy')}
        value={`${Math.round(stats.recentAccuracy * 100)}%`}
        color={stats.recentAccuracy >= 0.6 ? '#00b42a' : stats.recentAccuracy >= 0.4 ? '#ff7d00' : '#f53f3f'}
      />
    </div>
  );
};

const StatItem: React.FC<{ label: string; value: string | number; color?: string }> = ({ label, value, color }) => (
  <div className='flex flex-col items-center'>
    <span className='text-20px font-bold' style={color ? { color } : undefined}>
      {value}
    </span>
    <span className='text-12px text-t-tertiary'>{label}</span>
  </div>
);

/** Events sub-tab showing event history with generate-prediction action */
const EventsTab: React.FC<{ onCreateEvent: () => void }> = ({ onCreateEvent }) => {
  const { t } = useTranslation();
  const { events, loading, createEvent, deleteEvent } = useMarketEvents();
  const { generatePredictions } = usePredictions();

  const handleGenerate = useCallback(
    async (eventId: string) => {
      try {
        const preds = await generatePredictions(eventId);
        if (preds.length > 0) {
          Message.success(t('correlation.events.predictionsGenerated', { count: preds.length }));
        } else {
          Message.info(t('correlation.events.noPredictions'));
        }
      } catch (err) {
        Message.error(String(err));
      }
    },
    [generatePredictions, t]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteEvent(id);
        Message.success(t('correlation.events.deleted'));
      } catch (err) {
        Message.error(String(err));
      }
    },
    [deleteEvent, t]
  );

  if (loading) {
    return (
      <div className='flex justify-center py-40px'>
        <Spin />
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-16px'>
      <div className='flex items-center justify-end'>
        <Button type='primary' size='small' icon={<Plus theme='outline' size={14} />} onClick={onCreateEvent}>
          {t('correlation.events.logEvent')}
        </Button>
      </div>

      {events.length === 0 ? (
        <Empty description={t('correlation.events.empty')} />
      ) : (
        <div className='flex flex-col gap-12px'>
          {events.map((event) => (
            <EventCard key={event.id} event={event} onGenerate={handleGenerate} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
};

const EventCard: React.FC<{
  event: IMarketEvent;
  onGenerate: (eventId: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}> = ({ event, onGenerate, onDelete }) => {
  const { t } = useTranslation();

  return (
    <div className='bg-2 rd-12px p-16px flex flex-col gap-8px'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-8px'>
          <Tag color='arcoblue' size='small'>
            {t(`correlation.eventType.${event.eventType}`)}
          </Tag>
          <Tag color={severityColors[event.severity] || 'gray'} size='small'>
            {t('correlation.events.severity', { level: event.severity })}
          </Tag>
          {event.sector && (
            <Tag color='purple' size='small'>
              {event.sector}
            </Tag>
          )}
        </div>
        <div className='flex items-center gap-4px'>
          <Button type='text' size='mini' icon={<Lightning theme='outline' size={14} />} onClick={() => onGenerate(event.id)}>
            {t('correlation.events.predict')}
          </Button>
          <Popconfirm title={t('correlation.events.deleteConfirm')} onOk={() => onDelete(event.id)}>
            <Button type='text' size='mini' status='danger' icon={<DeleteOne theme='outline' size={14} />} />
          </Popconfirm>
        </div>
      </div>

      <div className='text-14px font-medium text-t-primary'>{event.title}</div>
      {event.description && <div className='text-13px text-t-secondary line-clamp-2'>{event.description}</div>}

      <div className='flex flex-wrap gap-6px'>
        {event.tickers.map((ticker) => (
          <Tag key={ticker} color='orangered' size='small'>
            {ticker}
          </Tag>
        ))}
      </div>

      <div className='flex items-center justify-between text-12px text-t-tertiary'>
        <span>{new Date(event.occurredAt).toLocaleString()}</span>
        {event.outcomeCount !== undefined && event.outcomeCount > 0 && (
          <span className='flex items-center gap-4px'>
            <TrendingUp theme='outline' size={12} />
            {t('correlation.events.outcomes', { count: event.outcomeCount })}
          </span>
        )}
      </div>
    </div>
  );
};

export default CorrelationPanel;
