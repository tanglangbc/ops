import { useEffect, useRef } from 'react'
// 全量引入：modular 引入（echarts/core + charts/components/renderers）在 rolldown 产物里
// 会在 init 阶段抛 `TypeError: ... is not a constructor`（组件注册被内联后失效），
// 全量引入已验证可用。体积代价见 README；先要能画，再谈瘦身。
import * as echarts from 'echarts'

/**
 * 通用图表壳：只吃 option，不做任何统计。
 * 依据【渲染器不得另算】：所有数字都来自构建期烘焙的 src/gen/*.json。
 */
export function Chart({ option, height = 300, empty }) {
  const ref = useRef(null)
  const inst = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    inst.current = echarts.init(ref.current, null, { renderer: 'canvas' })
    const onResize = () => inst.current && inst.current.resize()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); inst.current && inst.current.dispose(); inst.current = null }
  }, [])
  useEffect(() => {
    if (inst.current && option) inst.current.setOption(option, true)
  }, [option])
  if (!option) return empty || <div className="gap"><b>核不到</b>本图没有可画的数据</div>
  return <div className="chart" style={{ height }} ref={ref} />
}
