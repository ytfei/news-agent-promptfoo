# gzh.writer 版本说明

公众号【半程观测录】写作系统提示词。2026-11-07 由扁平 `prompts/gzh_writer_v*.md` 迁移为
`prompts/gzh.writer/vN.json`（system + user 两消息 chat 数组），遵循 `AGENTS.md` §4。

统一约定：
- 唯一输入变量 `{{news}}`，位于 user 消息；旧版 system 末尾的 `{{market}}` 从未被赋值，已删除。
- 旧版 `{{user_input}}`（仅存在于根目录 inline 配置）不再使用；其测试用例改以 `vars.news` 承载。
- 旧 `.md` 全文保留在 `legacy/prompts/`，本目录内容由其机械转换而来，未改写作要求。

## v0 (基线版)
- 来源：`legacy/prompts/gzh_writer_v0_test.md`（仅 `{{news}}` 的变体）。
- 内容：人设、读者、4 条文风、排版习惯、合规边界。
- 状态：留作版本史，不进 suite。

## v1 (增加负向禁止清单)
- 改动：新增「❌ 强制禁止」6 条（排比/套话开头/列表分点/生硬总结词/绝对断言/营销式引导）。
- 来源：`legacy/prompts/gzh_writer_v1.md`。
- 状态：留作版本史，不进 suite。

## v2 (句式叙事强制约束)
- 改动：在 v1 基础上新增「✅ 强制叙事规则」5 条（场景切入、先讲局限、短句、落地约束、思考过程优先）。
- 来源：`legacy/prompts/gzh_writer_v2.md`。
- 状态：**当前在用版本**，`evals/suites/writer.yaml` 的 A/B 基准侧。

## v3 (Few-shot 注入个人样本)
- 改动：在 v2 基础上新增「参考我的写作样本」3 段，并要求模仿语感、不复制原文；收尾句相应改为
  「模仿样本文本的语感，不要复制原文内容」。
- 来源：`legacy/prompts/gzh_writer_v3.md`。
- ⚠️ 已知问题：3 段样本正文仍是占位符（`【替换为你的公众号原文片段1，100~150字】`），
  few-shot 实际未生效。填入真实已发布片段前，v3 的对比结论不可用于选型决策。
- 状态：**候选版本**，与 v2 并列在 `writer.yaml` 做 A/B；决策后按 `AGENTS.md` §12 移除落选版本。

## 迁移对照

| 旧文件 | 新文件 |
|---|---|
| `legacy/prompts/gzh_writer_v0_test.md` | `v0.json` |
| `legacy/prompts/gzh_writer_v0.md` | （与 v0 相同，仅多 `{{market}}` 段，已合并） |
| `legacy/prompts/gzh_writer_v1.md` | `v1.json` |
| `legacy/prompts/gzh_writer_v2.md` | `v2.json` |
| `legacy/prompts/gzh_writer_v3.md` | `v3.json` |
