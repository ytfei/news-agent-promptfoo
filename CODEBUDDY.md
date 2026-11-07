# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

See `AGENTS.md` for the full current-state guide. `docs/prompt-eval-spec.md` and `docs/practice.md` are aspirational designs (an `evals/` + JSONL + CI structure) that this repo does **not** currently use — don't go looking for `evals/suites/`, `registry.yaml`, or `package.json`.

## What this repo is

A [promptfoo](https://promptfoo.dev) project for evaluating and iterating the **system prompt** of a WeChat public-account ("公众号") writer named **半程观测录**. The goal is to compare multiple versions of a Chinese writing-style system prompt and score them on a fixed 5-dimension rubric (人设视角 / 营销词与绝对化 / 句式段落 / 表达风格 / 合规边界, 0–2 each, /10 total).

There is no application code to build — the "code" here is YAML config + Markdown prompt files. There is no `package.json`, build, or unit tests. Everything runs through the global `promptfoo` CLI (`npx promptfoo` works too; check the version with `promptfoo --version`).

## Common commands

```bash
# Run the eval defined in the default config (promptfooconfig.yaml)
promptfoo eval

# Run a specific config file — always pass -c explicitly
promptfoo eval -c gzh_promptfoo.yml
promptfoo eval -c gzh_promptfoo_v1_1.yml

# Run a single test case by description substring
promptfoo eval -c gzh_promptfoo.yml --filter "正文｜AI Agent"

# Cheap smoke run
promptfoo eval -c promptfooconfig.yaml --limit 3

# Open the web viewer for the last run
promptfoo view

# Write results to a shareable HTML report
promptfoo eval -c promptfooconfig.yaml --output ./eval_result.html
```

The default `promptfoo eval` (no `-c`) uses `promptfooconfig.yaml`. To avoid surprises, always pass `-c <file>` explicitly when working on a specific experiment. Secrets: `.env` holds `ARK_API_KEY` (gitignored) for `gzh_promptfoo_v1_1.yml`'s `apiKeyEnvar`. The `README.md` instruction to set `OPENAI_API_KEY` is promptfoo scaffold boilerplate, not the current experiment.

## Repository layout

- `*.yml` — promptfoo experiment configs (the actual "source files").
- `prompts/gzh_writer_v*.md` — versioned system-prompt templates, referenced from configs via `id: file://prompts/...`. These contain `{{news}}` / `{{market}}` placeholders filled by test `vars`; `gzh_writer_v0_test.md` has only `{{news}}`.
- `data/信号简报_20260917.md` — the only input fixture, pulled into tests via `file://data/...`.
- `.env` — holds `ARK_API_KEY` for the Volcengine Ark / Doubao provider.

### The config files and what each is for

- `promptfooconfig.yaml` — the promptfoo **default** config. **Inline prompts**: two `raw:` blocks (v1 基础版 / v2 负向约束+few-shot) using `{{user_input}}`. This is the only config with **active `llm-rubric` assertions** carrying the full 5-dimension scoring rubric. deepseek provider with a hardcoded `apiKey`; `max_tokens: 1200`.
- `test.yml` — the actual throwaway smoke test: prompt "你好" plus one `contains` assertion, hardcoded deepseek key.
- `gzh_promptfoo.yml` — **file-based prompts**: pulls `prompts/gzh_writer_v0.md` / `v1.md` / `v2.md` via `file://` (v3 commented out). deepseek provider, `max_tokens: 120000`. Its entire `defaultTest.assert` (blacklist words + 5-dimension rubric) is **commented out**, so runs currently produce ungraded output.
- `gzh_promptfoo_v1.yml` — file-based, pulls `prompts/gzh_writer_v0_test.md` and injects `news` from `file://data/信号简报_20260917.md`. Same deepseek provider. No assertions.
- `gzh_promptfoo_v1_1.yml` — same structure as `gzh_promptfoo_v1.yml` but swaps the provider to `openai:chat:doubao-seed-evolving` hitting the Volcengine Ark endpoint, with the key read from `ARK_API_KEY` (`apiKeyEnvar`). No assertions.

Add new experiment variants by copying one of the `gzh_promptfoo*.yml` files and either adding a new `prompts/gzh_writer_vN.md` or a new inline `raw:` block.

## How a run works (the "big picture")

1. **Prompts** come from two sources: inline `raw:` strings, or `id: file://prompts/*.md` files. Both support `{{var}}` templating.
2. **Providers** generate completions. Two are used: `deepseek:deepseek-v4-flash` and `openai:chat:doubao-seed-evolving` (Ark-compatible, key from `ARK_API_KEY`).
3. **Tests** supply `vars` (literals or `file://` references) and **assertions**. The scoring mechanism is `type: llm-rubric` — a judge model (set under `defaultTest.options.provider`, currently the same model as the provider under test) grades each output against the 5-dimension rubric and returns a `/10` score plus a per-dimension breakdown and defect list. Only `promptfooconfig.yaml` has active assertions; the `gzh_promptfoo*.yml` configs currently generate output without grading.
4. `defaultTest.options.provider` sets the judge model for all rubric assertions; per-test `assert` blocks only carry the rubric text.

## Notes / gotchas

- `promptfooconfig.yaml` and `test.yml` hardcode a deepseek `apiKey` directly in the YAML, and it is already committed in git history — rotate it before sharing. `gzh_promptfoo_v1_1.yml` does it correctly via `apiKeyEnvar: ARK_API_KEY` + `.env`; prefer that pattern.
- Only `promptfooconfig.yaml` scores anything: `gzh_promptfoo.yml:42-90`'s `defaultTest.assert` is entirely commented out; `v1` / `v1_1` have no assertions at all.
- `promptfooconfig.yaml`'s second and third tests reuse the rubric by saying "沿用上面完全相同的5维度打分rubric" — the `value` text is abbreviated but relies on the first test's full rubric. Keep them in sync if you edit the rubric.
- `max_tokens` differs wildly: 1200 in `promptfooconfig.yaml` vs 120000 in all `gzh_promptfoo*.yml` — tune per experiment; 120000 looks like a copy-paste artifact for short posts.
- In `gzh_promptfoo.yml` the prompt files use `{{news}}` / `{{market}}`, but the tests supply `news: ""` (first case) or `user_input` (other cases). `{{market}}` is never supplied and `user_input` is never referenced, so those placeholders silently render empty.
- The judge provider equals the tested provider in every config (self-grading), so score discrimination is questionable.
- The prompt schema is declared via `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json` in the `gzh_promptfoo*.yml` files; use it for autocomplete in editors.
- `AGENTS.md` and `docs/` are currently untracked by git; a fresh clone only has `CODEBUDDY.md`.
