# 半程观测录 · 公众号写作提示词评测

用 [promptfoo](https://promptfoo.dev) 评测公众号「半程观测录」的**系统提示词**：把多个版本放在同一组样本上做 5 维度文风打分（人设视角 / 营销词与绝对化 / 句式段落 / 表达风格 / 合规边界，满分 10 分，通过线 8 分），用 A/B 结果决定采用哪一版。

- 工程规范（目录、断言分层、CI 门禁）：`AGENTS.md`（§0.5 是本项目落地映射与 0.125.1 版本校正）
- 当前目录结构与命令速查：`CODEBUDDY.md`
- 旧扁平配置已归档到 `legacy/`，不再使用

## 快速开始

```bash
npm ci
# .env 已被 gitignore，需自行填写：ARK_API_KEY、DEEPSEEK_API_KEY
npm run eval:smoke        # 2 条极小自检，先确认链路与 file:// 路径
npm run eval              # 主回归评测，产出 reports/writer.json
npm run view              # 打开交互式报告
```

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run eval:smoke` | 极小子集自检（2 条） |
| `npm run eval` | 主回归 suite（v2 在用 vs v3 候选） |
| `npm run eval:anchors` | rubric 锚点校准，改动 rubric 后必须 4/4 通过 |
| `npm run eval:redteam` | 红队（注入/诱导违规），只告警不阻断 |
| `npm run eval:all` | 串行跑全部 4 个 suite 并汇总 |
| `npm run eval:changed` | 按 git 改动只跑受影响的 suite |
| `npm run summary` | 汇总 `reports/*.json`，输出分组通过率 |
| `npm run view` | 查看最近一次评测 |

单条用例 / 单 suite 调试（promptfoo 0.125.1）：

```bash
promptfoo eval -c evals/suites/writer.yaml --filter-pattern "信号简报"
promptfoo eval -c evals/suites/writer.yaml -n 3          # --filter-first-n 3
node scripts/summary.mjs reports/*.json --gate          # 按通过率门禁
```

> 0.125.1 **没有** `--limit` / `--filter` / `--ci`；对应使用 `--filter-first-n` / `--filter-pattern` / `summary.mjs --gate`。

## 目录速览

```
prompts/gzh.writer/    版本化系统提示词（vN.json，唯一权威来源）+ NOTES.md
evals/registry.yaml    提示词索引与 pass_threshold
evals/suites/          4 个 suite：writer / smoke / judge-anchors / redteam
evals/datasets/writer/ golden / boundary / redteam / smoke .jsonl + fixtures/
evals/graders/         评分标准、判分模板、锚点样本
evals/common/          可复用的 JS 断言与 provider 同步源
scripts/               批量执行、增量选择、报告汇总
.github/workflows/     PR 增量门禁 + 每日定时
reports/               运行产物（gitignore）
```

被测模型是 `deepseek:deepseek-v4-flash`，评分裁判是**不同的**模型（Ark doubao），避免自评自判。密钥一律走环境变量，不要写进 YAML。
