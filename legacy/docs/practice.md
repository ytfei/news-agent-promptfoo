# 核心思路（适配你的架构：Langfuse + Promptfoo）
> 原则：**按业务域/能力拆分提示词，每个能力独立一套黄金集 + 独立评测套件；统一元数据规范，不要混在同一个 promptfoo 配置里跑**
你现在有多个不同类型提示词，比如：
- 资讯摘要 prompt
- 事件归因 prompt
- 行情解读 prompt
- 检索增强RAG prompt
- 工具调用（function call）prompt
- 回答校验/合规审核 prompt

它们的**输入格式、输出schema、评判标准、黄金样本完全不一样**，不能丢同一个评测suite里混测，否则断言互相打架、LLM Judge rubric失效、通过率没有意义。

整体分工不变：
✅ **Langfuse：统一注册、版本管理、标签、环境隔离、元数据**（所有prompt资产在这里）
✅ **Promptfoo：每个能力单独suite，独立数据集、独立断言、独立rubric；可以一次性批量触发多个suite**

下面从目录规范、Langfuse标签体系、Promptfoo组织、批量执行、CI策略、版本治理一步步给可落地方案。

---

## 一、Langfuse 侧：统一管理所有提示词（资产中心）
Langfuse Prompt Registry 是单一可信源，靠**标签 + 层级命名**区分类型，这一步是根基。

### 命名规范（推荐）
```
{domain}.{capability}.{variant}
```
示例：
- `finance.news.summarize` 资讯摘要
- `finance.news.attribution` 事件归因
- `finance.rag.answer` RAG问答
- `finance.tool.planner` Agent规划器
- `finance.compliance.check` 合规审核

### 标签体系（用来筛选）
- `type:summary` / `type:rag` / `type:planner` / `type:compliance`
- `model:gpt-4o` / `model:claude-3.5`
- `risk:high`（合规类、金融类，门禁更严）
- `env:dev/staging/prod`
- `owner:xxx`

> 每个prompt在Langfuse里绑定：描述、预期输出schema、参考文档、负责人；
> 数据集也按能力分开：`dataset-finance-news-summarize`、`dataset-finance-rag`。

Langfuse 对外暴露 Prompt API，你的业务代码**按名称拉取**，不硬编码prompt文本。
```
GET /api/prompts/finance.news.summarize?version=latest
```

---

## 二、Promptfoo 文件组织：按能力拆分Suite（重点）
不要一个大yaml装所有prompt。
推荐目录结构：
```
evals/
├── promptfooconfig.yaml          # 根入口，只做引用，不写测试逻辑
├── prompts/                       # 本地镜像（和Langfuse同步，方便review）
│   ├── finance-news-summarize/
│   │   ├── v1.json
│   │   └── v2.json
│   ├── finance-news-attribution/
│   ├── finance-rag-answer/
│   └── finance-compliance-check/
├── datasets/
│   ├── summarize-golden.csv
│   ├── summarize-redteam.csv
│   ├── attribution-golden.csv
│   ├── rag-golden.csv
│   └── compliance-golden.csv
├── graders/
│   ├── rubric-summarize.txt
│   ├── rubric-attribution.txt
│   ├── rubric-rag.txt
│   └── rubric-compliance.txt
└── suites/
    ├── summarize.yaml
    ├── attribution.yaml
    ├── rag.yaml
    ├── compliance.yaml
    └── all.yaml       # 批量入口：一次性跑全部回归套件
```

### 单个suite示例：suites/summarize.yaml
每个suite只负责一类提示词，**独立数据集、独立断言、独立judge rubric**
```yaml
# suites/summarize.yaml
description: 资讯摘要回归评测
prompts:
  - file://../prompts/finance-news-summarize/v1.json
  - file://../prompts/finance-news-summarize/v2.json
providers:
  - openai:gpt-4o
tests: file://../datasets/summarize-golden.csv
defaultTest:
  options:
    rubricPrompt: file://../graders/rubric-summarize.txt
    provider: openai:gpt-4o
assert:
  - type: not-contains
    value: 买入、加仓、看涨、投资建议
  - type: json-schema
    value:
      type: object
      properties:
        summary: {type: string}
        source: {type: string}
        risk_tip: {type: string}
      required: [summary, source, risk_tip]
commandLineOptions:
  maxConcurrency: 3
  cacheNamespace: finance-summarize
```

### suites/all.yaml 批量聚合（一次性跑所有回归）
```yaml
# suites/all.yaml
description: 全量回归套件
import:
  - ./summarize.yaml
  - ./attribution.yaml
  - ./rag.yaml
  - ./compliance.yaml
```
运行：
```bash
# 只跑摘要
npx promptfoo eval -c evals/suites/summarize.yaml

# 全量跑所有类型提示词回归
npx promptfoo eval -c evals/suites/all.yaml --ci
```

> 关键：每个suite有自己独立 `cacheNamespace`，**缓存互不干扰**，A/B对比不会串数据。

---

## 三、两种变更触发策略（非常适合多prompt场景）
### 方案A：按文件变更，选择性跑（推荐，省成本）
用 `git diff` 判断本次PR改动了哪一类prompt，只跑对应suite：
- 修改 `summarize` 的prompt → 只跑 summarize.yaml
- 修改合规prompt → 只跑 compliance.yaml（合规类阈值100%）
- 脚本思路：
  1. git diff 检出改动路径
  2. 映射路径 → suite名称
  3. 动态构造promptfoo命令，只执行对应suite

优点：CI速度快、token消耗低；只有全量发布时才跑 `all.yaml`。

### 方案B：每次PR强制全量跑 all.yaml
适合提示词数量不多、预算充足、风险极高的场景（金融合规）；缺点：慢、贵。

---

## 四、共享能力抽取（避免重复拷贝）
很多断言、provider配置、公共禁词是通用的，可以抽成公共片段，用yaml的 `$ref` 或者JS公共断言，或者用环境变量：
```
evals/common/
├── forbidden_words.js       # 通用金融禁词校验
├── base-providers.yaml      # 共用provider配置
└── base-risk-rules.yaml     # 通用合规断言
```
> 注意：promptfoo原生yaml不支持标准yaml anchor跨文件引用，两种替代方案：
> 1. 写简单bash/node脚本，合并公共片段再传给promptfoo
> 2. 公共逻辑封装成 `javascript` 断言，各个suite直接引用同一个js文件

示例公共断言：`forbidden_words.js`
```javascript
module.exports = (output) => {
  const badWords = ["买入","加仓","看涨","必涨","推荐"]
  return !badWords.some(w => output.includes(w))
}
```
在任意suite里复用：
```yaml
assert:
  - type: javascript
    value: file://../common/forbidden_words.js
```

---

## 五、版本与发布治理（多prompt最容易乱的地方）
1. **独立版本号**：每个能力prompt独立版本，不要全局一个大版本；`finance.news.summarize@v3`、`finance.rag.answer@v2`
2. **发布灰度**：Langfuse + LiteLLM 做流量A/B，按prompt名称切流量，不是一次性全量换
3. **依赖关系显式记录**
   比如 Agent Planner 依赖 RAG prompt，在Langfuse的prompt描述里写依赖，评测时：
   - 改被依赖的RAG prompt，自动触发 planner 的回归评测（靠脚本关联）
4. **降级策略**：每个prompt有prod/staging/dev三套，线上只拉prod版本

---

## 六、报告怎么看？多prompt混跑时怎么区分结果
- promptfoo 输出的html报告里会按 prompt + dataset 分组
- 导出json报告后，可以写一个简单的汇总脚本，按能力分组统计通过率：
  ```
  📊 评测汇总
  summarize: 96% ✅
  attribution: 92% ✅
  rag: 88% ⚠️
  compliance: 98% ✅
  ```
- 告警分级：
  - 合规类：必须100%，不通过直接阻断
  - 摘要/归因：允许小幅波动，阈值90~95%
  - 实验性prompt：只告警，不阻断门禁

---

## 七、可选进阶：用Promptfoo的变量矩阵，做同能力下多变体对比
如果你是**同一个能力、多个prompt变体**（比如同一个摘要任务，不同system prompt写法），放在同一个suite里做多模型+多prompt矩阵；
如果是**不同能力**（摘要 vs RAG），坚决分开suite。

✅ 正确：同一个suite：同任务、不同prompt版本 / 不同模型
❌ 错误：同一个suite：摘要 + RAG + 规划器混在一起

---

## 八、极简一句话总结这套体系
1. **Langfuse：统一注册所有prompt，按【域.能力】命名+标签，单一数据源**
2. **Promptfoo：一个能力一个suite，独立数据集、独立rubric、独立缓存namespace**
3. **CI：脚本检测git变更，增量跑对应suite；发版前跑all全量回归**
4. **公共规则抽成js断言，跨suite复用，减少重复维护**

---

如果你想要，我可以给你：
- 一份node小脚本：自动扫描git变更，动态生成本次要跑的suite列表，直接喂给promptfoo
- 配套的Langfuse标签&prompt命名模板，以及批量导出数据集脚本
