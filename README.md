# 半程观测录 · 公众号写作提示词评测

用 [promptfoo](https://promptfoo.dev) 对公众号「半程观测录」的**系统提示词**做可复现评测：同一组样本、同一套评分标准，横向比较多个提示词版本，用数据决定用哪一版。

- **单能力**：`gzh.writer`（公众号写作），版本 `v0`–`v3`，当前在用 v2、候选 v3
- **评分**：5 维度（人设视角 / 营销词与绝对化 / 句式段落 / 表达风格 / 合规边界），各 0–2 分，满分 10，通过线 8
- **裁判与被测分离**：被测 `deepseek-v4-flash`，裁判 Ark `doubao-seed-evolving`，避免自评自判
- **门禁**：主回归只按 golden 行判定通过率；boundary / redteam 只告警

工程规范见 [`AGENTS.md`](AGENTS.md)（§0.5 是本项目落地映射与 promptfoo 0.125.1 版本校正），给 AI Agent 的现状指南见 [`CODEBUDDY.md`](CODEBUDDY.md)。

---

## 前置要求

| 项 | 要求 |
|---|---|
| Node.js | **>= 22.22.0**（`package.json` 的 `engines`，promptfoo 0.125.1 要求） |
| promptfoo | 0.125.1，由 `pnpm install` 安装，无需全局安装 |
| pnpm | >= 12（本仓库用 pnpm；锁文件为 `pnpm-lock.yaml`） |
| 密钥 | `DEEPSEEK_API_KEY`（被测模型）、`ARK_API_KEY`（裁判模型） |

## 安装

```bash
pnpm install
```

## 配置密钥

复制模板后填入真实值（`.env` 已被 gitignore，不会提交）：

```bash
cp .env.example .env
# 编辑 .env：
# DEEPSEEK_API_KEY=sk-...
# ARK_API_KEY=ark-...
```

promptfoo 启动时会自动读取当前工作目录的 `.env`；CI 中改用仓库 Secrets（`DEEPSEEK_API_KEY` / `ARK_API_KEY`）。

## 快速开始

```bash
pnpm run eval:smoke   # 2 条自检：确认 file:// 路径、prompt 渲染、裁判链路
pnpm run eval         # 主回归（14 例 × 2 版本），产出 reports/writer.json
pnpm run summary      # 汇总分组通过率
pnpm run view         # 打开交互式报告
```

> 首次运行或改过配置后，建议加 `--no-cache` 确认真实调用，否则可能 100% 命中缓存：
> ```bash
> pnpm exec promptfoo eval -c evals/suites/writer.yaml --no-cache
> ```

## 命令总览

| 命令 | 实际执行 | 产物 |
|---|---|---|
| `pnpm run eval:smoke` | `promptfoo eval -c evals/suites/smoke.yaml` | 控制台表格 + 本地 DB |
| `pnpm run eval` | `pnpm exec promptfoo eval -c evals/suites/writer.yaml -o reports/writer.json` | `reports/writer.json` |
| `pnpm run eval:anchors` | 锚点校准 suite | `reports/judge-anchors.json` |
| `pnpm run eval:redteam` | 红队 suite | `reports/redteam.json` |
| `pnpm run eval:all` | `bash scripts/run-all.sh`：串行 4 个 suite + summary | `reports/*.json` |
| `pnpm run eval:changed` | 按 git 改动跑受影响的 suite | 对应 report |
| `pnpm run summary` | `node scripts/summary.mjs reports/*.json` | 控制台汇总 |
| `pnpm run view` | `promptfoo view` | 浏览器报告 |

按通过率门禁（PR 用）：

```bash
node scripts/summary.mjs reports/*.json --gate   # 不达标退出码 1
```

## 调试单个用例

```bash
# 按 description 正则过滤
pnpm exec promptfoo eval -c evals/suites/writer.yaml --filter-pattern "信号简报"

# 只跑前 N 条
pnpm exec promptfoo eval -c evals/suites/writer.yaml -n 3

# 按 metadata 过滤（例如只看高风险）
pnpm exec promptfoo eval -c evals/suites/writer.yaml --filter-metadata risk=high

# 跳过缓存
pnpm exec promptfoo eval -c evals/suites/writer.yaml --no-cache

# 只跑指定 provider
pnpm exec promptfoo eval -c evals/suites/writer.yaml --filter-providers deepseek
```

> promptfoo **0.125.1 没有** `--limit` / `--filter` / `--ci`。对应使用 `--filter-first-n` / `--filter-pattern` / `summary.mjs --gate`。

## 不花 token 的检查

```bash
# 本次改动会触发哪些 suite
node scripts/changed-suites.mjs

# 用已有报告验证门禁（不重新调用模型）
node scripts/summary.mjs reports/*.json --gate

# JSONL 逐行校验
node -e "const fs=require('fs'),p=require('path');const w=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?w(p.join(d,e.name)):[p.join(d,e.name)]);w('evals').filter(f=>f.endsWith('.jsonl')).forEach(f=>fs.readFileSync(f,'utf8').split('\n').filter(Boolean).forEach((l,i)=>{try{JSON.parse(l)}catch(e){console.error(f+':'+(i+1),e.message);process.exitCode=1}}));console.log('JSONL OK')"

# 脚本语法
for f in scripts/*.mjs evals/common/*.js; do node --check "$f"; done
```

## 目录结构

```
prompts/gzh.writer/      版本化系统提示词 v0..v3.json（唯一权威来源）+ NOTES.md
evals/
  registry.yaml          提示词索引：id、suites、pass_threshold、datasets
  suites/                4 个 suite：writer / smoke / judge-anchors / redteam
  datasets/writer/       golden / boundary / redteam / smoke .jsonl + fixtures/
  graders/               评分标准、判分模板、锚点样本
  common/                可复用 JS 断言 + provider 同步源
scripts/                 run-all.sh / changed-suites.mjs / summary.mjs
.github/workflows/       PR 增量门禁 + 每日定时
reports/                 运行产物（gitignore）
legacy/                  归档的旧扁平配置（仅追溯用）
```

各目录职责：

| 目录 | 放什么 |
|---|---|
| `prompts/` | 纯提示词文本，不含断言/数据 |
| `evals/datasets/` | 输入变量、`expected`、metadata、极少数单条断言 |
| `evals/graders/` | 评分标准、判分模板、锚点样本 |
| `evals/common/` | 跨 suite 复用的 JS 断言、provider 定义 |
| `scripts/` | 批量执行、增量选择、报告汇总 |

## 一次评测是怎么跑的

1. suite 通过 `file://../../prompts/gzh.writer/vN.json` 引用提示词（`file://` 基准是 **config 所在目录** `evals/suites/`）
2. dataset JSONL 的 `vars.news` 提供输入：任务指令，或 `file://../datasets/writer/fixtures/...` 素材
3. 被测 provider `deepseek:deepseek-v4-flash` 生成公众号正文（`showThinking: false`，`max_tokens: 8000`）
4. `defaultTest.assert` 4 条全局断言：
   - `no_marketing_words`（JS 禁词/套话）
   - `no_investment_advice`（JS 投资建议话术）
   - `not_empty`（JS 非空）
   - `rubric_quality`（`llm-rubric`，5 维度 /10，`threshold: 8`）
5. 该用例自己的 `assert` **叠加**在全局之上（如长度范围、CTA 检查）
6. 裁判走独立 provider（Ark）+ 自定义 `rubricPrompt`，输出 0–10 的 JSON

## 数据集与门禁地位

| 文件 | 内容 | 门禁 |
|---|---|---|
| `golden.jsonl` | 稳定基准（4 条真实样本） | **阻断**（pass_rate < 0.8 或高危失败） |
| `boundary.jsonl` | 空输入 / 极短 / 数字密集 | 只告警，记录趋势 |
| `redteam.jsonl` | 注入、诱导违规 | 只告警 |
| `smoke.jsonl` | 2 条快速自检 | 不参与 |

> boundary 失败不等于链路坏了。例如模型在正文里写出「综上所述」，确定性断言会命中，但 LLM judge 仍可能给高分——正是「确定性断言优先」的意义。

## 评分与锚点校准

- `evals/graders/rubric-writer.txt`：**评分标准**（5 维度，各 0–2，满分 10）
- `evals/graders/judge-prompt-writer.json`：**判分模板**（注入 `{{rubric}}` / `{{output}}`、防注入段、强制 0–10 JSON）
- 两者分离，才能让 `threshold: 8` 生效；`registry.yaml` 的 `pass_threshold: 0.8` 等价于 8/10

**改动 rubric 后必须校准**：

```bash
pnpm run eval:anchors   # 2 个 pass 锚点 + 2 个 fail 锚点，必须 4/4 结论正确
```

锚点用 `echo` provider 把固定文本喂给判分器；pass 用 `llm-rubric`、fail 用 `not-llm-rubric`。若方向反了，说明 rubric 措辞或阈值需要重写。

## 迭代提示词版本

1. 新建 `prompts/gzh.writer/v4.json`（**不要覆盖旧版**）
2. 在 `prompts/gzh.writer/NOTES.md` 记录改动、动机、对比结论
3. 在 `evals/suites/writer.yaml` 的 `prompts` 里并列 `v3` 与 `v4`（A/B 只变 prompt 一个维度）
4. `pnpm run eval`，看总分、各 metric、token 成本与延迟
5. 结论确定后，从 suite 移除落选版本，更新 `evals/registry.yaml` 与 `NOTES.md`

新增能力（如摘要、归因）时，才需要新建 prompt ID + 独立 suite + 独立数据集 + 独立 rubric，并在 registry 登记。

## CI 与门禁

`.github/workflows/prompt-eval.yml`：

- **PR**：`changed-suites.mjs` 按改动路径解析待跑 suite → 运行 → `summary.mjs --gate` 判定
- **每日定时**：全量跑 4 个 suite
- **手动**：`workflow_dispatch`
- 报告始终作为 artifact 上传

门禁规则（`summary.mjs --gate`）：

- 只对 **`golden` / `regression`** 行计算通过率，需 ≥ `pass_threshold`（0.8）
- 阻断型 suite 的 **高危（risk=high）失败** 直接阻断
- `boundary` / `redteam` / `smoke` / `anchor` 只告警

## 常见问题

| 现象 | 原因 / 解决 |
|---|---|
| 结果瞬间出、`Incurred Tokens: 0` | 命中了缓存；加 `--no-cache` 真实运行 |
| 长素材输出为空 | `max_tokens` 太小被 reasoning 吃光；本项目用 8000 + `showThinking: false` |
| `file://` 找不到文件 | 路径基准是 **config 目录** `evals/suites/`；prompts 用 `../../`，evals 内资源用 `../` |
| `not-contains` 报 "must have a string or number value" | 0.125.1 不支持数组；改 `javascript` 表达式或 `contains-any` |
| `tags` 报 "expected record, received array" | `tags` 必须写成 record：`tags: {capability: ..., kind: ...}` |
| 命令报 unknown option `--limit` / `--ci` | 0.125.1 已移除；用 `--filter-first-n` / `summary.mjs --gate` |
| 判分偏高、无区分度 | 检查 judge 是否等于被测模型；本项目裁判固定为 Ark doubao |
| boundary 失败但门禁通过 | 预期行为，boundary 只告警；人工复核后再回灌回归样本 |

## legacy

`legacy/` 是重构前的扁平配置（根目录 `*.yml`、`prompts/gzh_writer_v*.md`、两份旧设计稿），**归档未删除**。仅用于追溯，不要复制其中的写法（`{{market}}` 幽灵变量、注释掉的断言、自评裁判、`max_tokens: 120000`）。

## 安全

- 密钥只放 `.env` 或环境变量，**不要写进 YAML**；新配置统一用 `apiKeyEnvar` / provider 默认环境变量
- 历史提交中曾出现过硬编码的 deepseek key（已在 `legacy/` 副本中 scrub），请到服务商后台**轮换**
- `reports/`、`.env`、`node_modules/` 均已被 gitignore
