/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IStockAgent, ICreateStockAgentParams } from '@/common/ipcBridge';
import { Drawer, Form, Input, Switch, Message } from '@arco-design/web-react';
import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const FormItem = Form.Item;
const TextArea = Input.TextArea;

type StockAgentFormProps = {
  visible: boolean;
  agent?: IStockAgent | null;
  onClose: () => void;
  onSave: (params: ICreateStockAgentParams) => Promise<void>;
};

const StockAgentForm: React.FC<StockAgentFormProps> = ({ visible, agent, onClose, onSave }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const isEdit = !!agent;

  const initialValues = useMemo(
    () => ({
      name: agent?.name || '',
      tickers: agent?.tickers?.join(', ') || '',
      prompt: agent?.prompt || '',
      scheduleCron: agent?.scheduleCron || '',
      enabled: agent?.enabled ?? true,
    }),
    [agent]
  );

  useEffect(() => {
    if (visible) {
      form.setFieldsValue(initialValues);
    }
  }, [visible, initialValues, form]);

  const handleSave = async () => {
    try {
      const values = await form.validate();
      setSaving(true);

      const tickers = (values.tickers as string)
        .split(',')
        .map((t: string) => t.trim().toUpperCase())
        .filter(Boolean);

      await onSave({
        name: values.name,
        tickers,
        prompt: values.prompt,
        scheduleCron: values.scheduleCron || undefined,
        enabled: values.enabled,
      });

      Message.success(isEdit ? t('stockAgent.updateSuccess') : t('stockAgent.createSuccess'));
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
    <Drawer
      width={480}
      title={isEdit ? t('stockAgent.form.editTitle') : t('stockAgent.form.createTitle')}
      visible={visible}
      onCancel={onClose}
      okText={t('common.save')}
      okLoading={saving}
      onOk={handleSave}
    >
      <Form form={form} layout='vertical' initialValues={initialValues}>
        <FormItem label={t('stockAgent.form.name')} field='name' rules={[{ required: true }]}>
          <Input placeholder={t('stockAgent.form.namePlaceholder')} />
        </FormItem>

        <FormItem label={t('stockAgent.form.tickers')} field='tickers' rules={[{ required: true }]} extra={t('stockAgent.form.tickersHint')}>
          <Input placeholder={t('stockAgent.form.tickersPlaceholder')} />
        </FormItem>

        <FormItem label={t('stockAgent.form.prompt')} field='prompt' rules={[{ required: true }]}>
          <TextArea placeholder={t('stockAgent.form.promptPlaceholder')} autoSize={{ minRows: 4, maxRows: 12 }} />
        </FormItem>

        <FormItem label={t('stockAgent.form.schedule')} field='scheduleCron' extra={t('stockAgent.form.scheduleHint')}>
          <Input placeholder={t('stockAgent.form.schedulePlaceholder')} />
        </FormItem>

        <FormItem label={t('stockAgent.form.enabled')} field='enabled' triggerPropName='checked'>
          <Switch />
        </FormItem>
      </Form>
    </Drawer>
  );
};

export default StockAgentForm;
