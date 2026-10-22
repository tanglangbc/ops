/** 页面清单（唯一真源）：vite 多入口与 HTML 生成器共用，避免两处漂移 */
export const PAGES = [
  'index',
  'l2-forward',
  'l2-acceptance',
  'backtest-4h',
  'edge-scan',
  'carry-funding',
  'carry-now',
  'freeze-log',
  'exp-index',
]

export const TITLES = {
  index: '代币量化研究成果 · 可视化站点',
  'l2-forward': 'VS-2.1 L2 前向台账',
  'l2-acceptance': 'VS-2.2 L2 验收结果',
  'backtest-4h': 'VS-2.3 4h 回测三段',
  'edge-scan': 'VS-2.4 210 变体扫描',
  'carry-funding': 'VS-2.5 carry 资金费',
  'carry-now': 'VS-2.6 carry 现状复核',
  'freeze-log': 'VS-2.7 冻结/闸门记录',
  'exp-index': 'VS-2.8 实验索引',
}
