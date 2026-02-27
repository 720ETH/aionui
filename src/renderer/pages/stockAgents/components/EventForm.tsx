/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICreateMarketEventParams, MarketEventType } from '@/common/ipcBridge';
import { Drawer, Form, Input, InputNumber, Message, Select, DatePicker } from '@arco-design/web-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const FormItem = Form.Item;
const TextArea = Input.TextArea;

const EVENT_TYPES: MarketEventType[] = ['earnings', 'news', 'macro', 'policy', 'sector', 'technical', 'other'];

type EventFormProps = {
  visible: boolean;
  onClose: () => void;
  onSave: (params: ICreateMarketEventParams) => Promise<void>;
};

const EventForm: React.FC<EventFormProps> = ({ visible, onClose, onSave }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      const values = await form.validate();
      setSaving(true);

      const tickers = (values.tickers as string)
        .split(',')
        .map((s: string) => s.trim().toUpperCase())
        .filter(Boolean);

      await onSave({
        eventType: values.eventType,
        title: values.title,
        description: values.description || undefined,
        tickers,
        sector: values.sector || undefined,
        source: values.source || undefined,
        severity: values.severity ?? 3,
        occurredAt: values.occurredAt ? new Date(values.occurredAt).getTime() : Date.now(),
      });

      Message.success(t('correlation.eventCreated'));
      form.resetFields();
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        Message.error(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer width={480} title={t('correlation.eventForm.title')} visible={visible} onCancel={onClose} okText={t('common.save')} okLoading={saving} onOk={handleSave}>
      <Form form={form} layout='vertical' initialValues={{ severity: 3 }}>
        <FormItem label={t('correlation.eventForm.eventType')} field='eventType' rules={[{ required: true }]}>
          <Select placeholder={t('correlation.eventForm.eventTypePlaceholder')}>
            {EVENT_TYPES.map((et) => (
              <Select.Option key={et} value={et}>
                {t(`correlation.eventType.${et}`)}
              </Select.Option>
            ))}
          </Select>
        </FormItem>

        <FormItem label={t('correlation.eventForm.eventTitle')} field='title' rules={[{ required: true }]}>
          <Input placeholder={t('correlation.eventForm.titlePlaceholder')} />
        </FormItem>

        <FormItem label={t('correlation.eventForm.description')} field='description'>
          <TextArea placeholder={t('correlation.eventForm.descriptionPlaceholder')} autoSize={{ minRows: 2, maxRows: 6 }} />
        </FormItem>

        <FormItem label={t('correlation.eventForm.tickers')} field='tickers' rules={[{ required: true }]} extra={t('correlation.eventForm.tickersHint')}>
          <Input placeholder={t('correlation.eventForm.tickersPlaceholder')} />
        </FormItem>

        <FormItem label={t('correlation.eventForm.sector')} field='sector'>
          <Input placeholder={t('correlation.eventForm.sectorPlaceholder')} />
        </FormItem>

        <FormItem label={t('correlation.eventForm.source')} field='source'>
          <Input placeholder={t('correlation.eventForm.sourcePlaceholder')} />
        </FormItem>

        <FormItem label={t('correlation.eventForm.severity')} field='severity' extra={t('correlation.eventForm.severityHint')}>
          <InputNumber min={1} max={5} step={1} />
        </FormItem>

        <FormItem label={t('correlation.eventForm.occurredAt')} field='occurredAt'>
          <DatePicker showTime style={{ width: '100%' }} />
        </FormItem>
      </Form>
    </Drawer>
  );
};

export default EventForm;
