# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## What this repo is

A [promptfoo](https://promptfoo.dev) project for evaluating and iterating the **system prompt** of a WeChat public-account ("公众号") writer named **半程观测录**. The goal is to compare multiple versions of a Chinese writing-style system prompt and score them on a fixed 5-dimension rubric (人设视角 / 营销词与绝对化 / 句式段落 / 表达风格 / 合规边界).

There is no application code to build — the "code" here is YAML config + Markdown prompt files. Everything runs through the `promptfoo` CLI (installed globally, v0.124.1; `npx promptfoo` works too).

## Common commands

```bash
# Run the eval defined in the default config (promptfooconfig.yaml)
promptfoo eval

# Run a specific config file
promptfoo eval -c gzh_promptfoo.yml
promptfoo eval -c gzh_promptfoo_v1_1.yml

# Run a single test case by description substring
promptfoo eval -c gzh_promptfoo.yml --filter "正文｜AI Agent"

# Open the web viewer for the last run
promptfoo view

# Write results to a shareable HTML report
promptfoo eval -c gzh_promptfoo.yml --output ./eval_result.html
```

The default `promptfoo eval` (no `-c`) uses `promptfooconfig.yaml`. To avoid surprises, always pass `-c <file>` explicitly when working on a specific experiment.

## Repository layout

- `*.yml` — promptfoo experiment configs (the actual "source files").
- `prompts/gzh_writer_v*.md` — versioned system-prompt templates, referenced from configs via `id: file://prompts/...`. These contain `{{news}}` / `{{market}}` placeholders filled by test `vars`.
- `data/` — input fixtures, e.g. `信号简报_20260917.md`, pulled into tests via `file://data/...`.
- `.env` — holds `ARK_API_KEY` for the Volcengine Ark / Doubao provider.

### The config files and what each is for

- `promptfooconfig.yaml` — the promptfoo default config. Currently a throwaway smoke test ("你好" / contains assert). Not the main experiment.
- `test.yml` — minimal deepseek smoke test (`contains` assertion).
- `gzh_promptfoo.yml` — **inline prompts**: system prompts written directly as `raw:` blocks (v1, v2). Uses `deepseek:deepseek-v4-flash` and `llm-rubric` assertions carrying the full 5-dimension scoring rubric.
- `gzh_promptfoo_v1.yml` — **file-based prompts**: pulls `prompts/gzh_writer_v0_test.md` via `file://`, injects `news` from `data/` via `file://`. Same deepseek provider.
- `gzh_promptfoo_v1_1.yml` — same structure as `gzh_promptfoo_v1.yml` but swaps the provider to `openai:chat:doubao-seed-evolving` hitting the Volcengine Ark endpoint, with the key read from `ARK_API_KEY` (`apiKeyEnvar`).

Add new experiment variants by copying one of the `gzh_promptfoo*.yml` files and either adding a new `prompts/gzh_writer_vN.md` or a new inline `raw:` block.

## How a run works (the "big picture")

1. **Prompts** come from two sources: inline `raw:` strings, or `id: file://prompts/*.md` files. Both support `{{var}}` templating.
2. **Providers** generate completions. Two are used: `deepseek:deepseek-v4-flash` (key inline in `config.apiKey`) and `openai:chat:doubao-seed-evolving` (Ark-compatible, key from `ARK_API_KEY`).
3. **Tests** supply `vars` (literals or `file://` references) and **assertions**. The main scoring mechanism is `type: llm-rubric` — a judge model (here, the same deepseek model under `defaultTest.options.provider`) grades each output against the 5-dimension rubric and returns a `/10` score plus a per-dimension breakdown and defect list.
4. `defaultTest.options.provider` sets the judge model for all rubric assertions; per-test `assert` blocks only carry the rubric text.

## Notes / gotchas

- Some configs (`promptfooconfig.yaml`, `test.yml`) hardcode a deepseek `apiKey` directly in the YAML. `gzh_promptfoo_v1_1.yml` does it correctly via `apiKeyEnvar: ARK_API_KEY` + `.env`. Prefer the `apiKeyEnvar` pattern; rotate any committed key before sharing the repo.
- `gzh_promptfoo.yml`'s second and third tests reuse the rubric by saying "沿用上面完全相同的5维度打分rubric" — the `value` text is abbreviated but relies on the first test's full rubric. Keep them in sync if you edit the rubric.
- `max_tokens` differs wildly between configs (1200 in `gzh_promptfoo.yml` vs 120000 in `gzh_promptfoo_v1*.yml`) — tune per experiment; 120000 looks like a copy-paste artifact for short posts.
- The prompt schema is declared via `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json` in the `gzh_promptfoo*.yml` files; use it for autocomplete in editors.
