/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CorrelationDirection, IPrediction } from '@/common/ipcBridge';
import { Button, Empty, Form, InputNumber, Message, Modal, Select, Spin, Tag } from '@arco-design/web-react';
import { CheckOne, CloseOne } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePredictions } from '../hooks/useCorrelation';

const directionColorMap: Record<string, string> = {
  bullish: 'green',
  bearish: 'red',
  neutral: 'gray',
};

const PredictionsTab: React.FC = () => {
  const { t } = useTranslation();
  const { predictions, loading, verifyPrediction } = usePredictions();
  const [verifyModal, setVerifyModal] = useState<IPrediction | null>(null);

  if (loading) {
    return (
      <div className='flex justify-center py-40px'>
        <Spin />
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-16px'>
      {predictions.length === 0 ? (
        <Empty description={t('correlation.predictions.empty')} />
      ) : (
        <div className='flex flex-col gap-12px'>
          {predictions.map((pred) => (
            <PredictionCard key={pred.id} prediction={pred} onVerify={() => setVerifyModal(pred)} />
          ))}
        </div>
      )}

      {verifyModal && (
        <VerifyModal
          prediction={verifyModal}
          onClose={() => setVerifyModal(null)}
          onVerify={async (dir, impact) => {
            try {
              await verifyPrediction({
                predictionId: verifyModal.id,
                actualDirection: dir,
                actualImpact: impact,
              });
              Message.success(t('correlation.predictions.verified'));
              setVerifyModal(null);
            } catch (err) {
              Message.error(String(err));
            }
          }}
        />
      )}
    </div>
  );
};

const PredictionCard: React.FC<{ prediction: IPrediction; onVerify: () => void }> = ({ prediction, onVerify }) => {
  const { t } = useTranslation();
  const isVerified = prediction.isCorrect !== undefined;

  return (
    <div className='bg-2 rd-12px p-16px flex flex-col gap-8px'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-8px'>
          <Tag color='arcoblue' size='small'>
            {prediction.ticker}
          </Tag>
          <Tag color={directionColorMap[prediction.predictedDirection] ?? 'gray'} size='small'>
            {t(`correlation.direction.${prediction.predictedDirection}`)}
          </Tag>
          <span className='text-13px text-t-secondary'>
            {prediction.predictedImpact >= 0 ? '+' : ''}
            {prediction.predictedImpact.toFixed(2)}%
          </span>
        </div>
        <div className='flex items-center gap-8px'>
          <span className='text-12px text-t-tertiary'>
            {t('correlation.predictions.confidence')}: {Math.round(prediction.confidence * 100)}%
          </span>
          {isVerified ? (
            prediction.isCorrect ? (
              <Tag color='green' size='small' icon={<CheckOne theme='outline' size={12} />}>
                {t('correlation.predictions.correct')}
              </Tag>
            ) : (
              <Tag color='red' size='small' icon={<CloseOne theme='outline' size={12} />}>
                {t('correlation.predictions.incorrect')}
              </Tag>
            )
          ) : (
            <Button type='outline' size='mini' onClick={onVerify}>
              {t('correlation.predictions.verify')}
            </Button>
          )}
        </div>
      </div>

      {isVerified && prediction.actualDirection && (
        <div className='text-12px text-t-tertiary flex items-center gap-12px'>
          <span>
            {t('correlation.predictions.actual')}: {t(`correlation.direction.${prediction.actualDirection}`)}
          </span>
          {prediction.actualImpact !== undefined && (
            <span className={prediction.actualImpact >= 0 ? 'text-[#00b42a]' : 'text-[#f53f3f]'}>
              {prediction.actualImpact >= 0 ? '+' : ''}
              {prediction.actualImpact.toFixed(2)}%
            </span>
          )}
        </div>
      )}

      <div className='text-12px text-t-tertiary'>{new Date(prediction.createdAt).toLocaleString()}</div>
    </div>
  );
};

type VerifyModalProps = {
  prediction: IPrediction;
  onClose: () => void;
  onVerify: (direction: CorrelationDirection, impact: number) => Promise<void>;
};

const VerifyModal: React.FC<VerifyModalProps> = ({ prediction, onClose, onVerify }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const handleOk = useCallback(async () => {
    try {
      const values = await form.validate();
      setSaving(true);
      await onVerify(values.actualDirection, values.actualImpact);
    } catch (err) {
      if (err instanceof Error) {
        Message.error(err.message);
      }
    } finally {
      setSaving(false);
    }
  }, [form, onVerify]);

  return (
    <Modal
      visible
      title={t('correlation.predictions.verifyTitle', { ticker: prediction.ticker })}
      onCancel={onClose}
      onOk={handleOk}
      okLoading={saving}
      okText={t('common.save')}
    >
      <Form form={form} layout='vertical'>
        <Form.Item label={t('correlation.predictions.actualDirection')} field='actualDirection' rules={[{ required: true }]}>
          <Select>
            <Select.Option value='bullish'>{t('correlation.direction.bullish')}</Select.Option>
            <Select.Option value='bearish'>{t('correlation.direction.bearish')}</Select.Option>
            <Select.Option value='neutral'>{t('correlation.direction.neutral')}</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label={t('correlation.predictions.actualImpact')} field='actualImpact' rules={[{ required: true }]} extra={t('correlation.predictions.actualImpactHint')}>
          <InputNumber step={0.1} suffix='%' style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default PredictionsTab;
