# 币安现货与 USDⓈ-M 永续策略的交易成本事实

> 核验日期：2026-10-22  
> 用途：为“基于现有研究制定币安获利方案”的讨论提供一手交易规则依据。  
> 范围：只记录币安官方规则与数据接口，不证明任何策略有盈利优势，也不构成收益承诺。

## 结论

1. 评估策略时必须按账户实际手续费档位、订单成交方式和实际结算记录核算，不能把公开费率示例当成用户账户的已确认费率。
2. 现货与 USDⓈ-M 永续的费用模型不同。现货交易费按成交额和费率计算；永续除开平仓手续费外，还可能支付或收到资金费。
3. 资金费率是多空持仓者之间的周期性支付，不是固定利息。符号、数值与结算间隔都需要按交易对和时间逐笔核验。
4. 订单可执行性也要纳入回测：交易对的价格步长、数量步长、最小数量与名义价值限制可能使理论订单不能提交或不能按预期成交。

## 一手来源与事实

### 1. 现货手续费

币安官方现货费率表列出 Regular User 的标准 Maker/Taker 基准费率为 0.100% / 0.100%；页面还列出使用 BNB 支付手续费时的折扣费率。实际费率仍须以账户适用的费率、交易对和活动规则为准。

来源：[Binance Spot Trading Fee Rate](https://www.binance.com/en/fee/trading)

### 2. USDⓈ-M 永续手续费

币安官方合约手续费说明以名义成交价值乘手续费率计算手续费，并举例说明普通用户的 Maker 费率 0.02%、Taker 费率 0.05%。该示例用于说明计算方法，不应被当成对特定账户当前费率的确认。

来源：[Binance Futures Fee Structure & Fee Calculations](https://www.binance.com/en/support/faq/detail/360033544231)  
当前费率查询入口：[Binance USDⓈ-M Futures Fee Rate](https://www.binance.com/en/fee/futureFee)

### 3. 资金费与结算时间

币安官方说明，资金费率是永续合约多头和空头持仓者之间的周期性支付，用于促使永续合约价格向标的指数价格收敛。资金费计算为：

`资金费 = 持仓名义价值 × 资金费率`

正资金费率下，多头支付给空头；负资金费率下，空头支付给多头。币安说明资金费支付按合约规格中的间隔执行，默认通常为每 8 小时一次，但在市场条件或合约规则调整时可能变化；只有在指定资金费结算时持有仓位，才会产生相应支付或收取。

来源：[Introduction to Binance Futures Funding Rates](https://www.binance.com/en/support/faq/detail/360033525031)

### 4. 获取历史资金费和间隔调整信息

USDⓈ-M Futures 官方公开市场数据 API：
- `GET /fapi/v1/fundingRate`：查询资金费率历史，响应包含交易对、资金费率、资金费时间和相关标记价格。
- `GET /fapi/v1/fundingInfo`：查询曾调整资金费率上下限或结算间隔的交易对信息，其中可包含 `fundingIntervalHours`。

来源：[Binance Developer Docs — USDⓈ-M Futures Market Data](https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Get-Funding-Rate-History)

### 5. 现货订单过滤规则

币安现货交易规则定义了交易对过滤器，例如 `PRICE_FILTER`（价格上下限及价格步长）。策略执行与回测应以交易所实时返回的交易规则为准，避免产生不符合规则的价格或数量。

来源：[Binance Spot API — Filters](https://developers.binance.com/docs/binance-spot-api-docs/filters)

## 对策略评估的含义

- 日线或 4 小时策略：报告中应明确 Maker/Taker 假设、手续费、滑点、成交规则、未成交订单处理与订单过滤规则。
- 现货 + 永续对冲：不能把当前资金费率直接年化后当作已实现收益。必须逐期汇总实际资金费现金流，并扣除两条腿的开仓和平仓手续费、滑点、基差变化、再平衡成本等。
- Carry 双数展示：回放层估算值与近 30 天实测折算值必须各自注明窗口与口径；它们不能互相替代。
- 账户适用费率、历史交易成交和资金费流水尚未从用户账户核验，均应标记为“核不到”，不得用公开费率示例补齐。
- 本文只解决交易机制事实，不对任何策略给出“通过”的盈利裁决。策略结论仍以原始实验数据、样本外结果与预先冻结的验收门槛为准。
