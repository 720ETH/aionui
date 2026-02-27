/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IStockAgent } from '@/common/ipcBridge';
import { Drawer, Empty, Spin, Tag } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useStockReports } from '../hooks/useStockAgents';

type StockReportDrawerProps = {
  visible: boolean;
  agent: IStockAgent | null;
  onClose: () => void;
};

const statusColorMap: Record<string, string> = {
  pending: 'gold',
  running: 'blue',
  done: 'green',
  error: 'red',
};

const StockReportDrawer: React.FC<StockReportDrawerProps> = ({ visible, agent, onClose }) => {
  const { t } = useTranslation();
  const { reports, loading } = useStockReports(visible && agent ? agent.id : null);

  return (
    <Drawer width={560} title={`${t('stockAgent.report.title')} — ${agent?.name ?? ''}`} visible={visible} onCancel={onClose} footer={null}>
      {loading ? (
        <div className='flex justify-center py-40px'>
          <Spin />
        </div>
      ) : reports.length === 0 ? (
        <Empty description={t('stockAgent.report.empty')} />
      ) : (
        <div className='flex flex-col gap-16px'>
          {reports.map((report) => (
            <div key={report.id} className='bg-2 rd-12px p-16px flex flex-col gap-8px'>
              <div className='flex items-center justify-between'>
                <span className='text-12px text-t-tertiary'>{new Date(report.createdAt).toLocaleString()}</span>
                <Tag color={statusColorMap[report.status] ?? 'gray'} size='small'>
                  {t(`stockAgent.report.status.${report.status}`)}
                </Tag>
              </div>

              {report.summary && <div className='text-14px text-t-primary whitespace-pre-wrap'>{report.summary}</div>}

              {report.errorMessage && <div className='text-13px text-[#f53f3f]'>{report.errorMessage}</div>}

              {report.rawContent && (
                <details className='text-12px text-t-secondary'>
                  <summary className='cursor-pointer select-none'>Raw output</summary>
                  <pre className='mt-8px bg-3 rd-8px p-12px overflow-x-auto text-12px whitespace-pre-wrap'>{report.rawContent}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
};

export default StockReportDrawer;
