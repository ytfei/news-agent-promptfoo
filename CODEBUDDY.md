# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## What this repo is

A [promptfoo](https://promptfoo.dev) project that evaluates **one** capability: the system prompt of a Chinese WeChat public-account ("公众号") writer named **半程观测录**. It A/B-compares versioned system prompts against a fixed 5-dimension style rubric (人设视角 / 营销词与绝对化 / 句式段落 / 表达风格 / 合规边界, 0–2 each, **/10 total**, pass line 8/10).

There is **no application code** — the "source" is YAML config + versioned prompt JSON + JSONL datasets. No build, no unit tests. `promptfoo 0.125.1` is pinned in `package.json` and requires **Node >=22.22.0** (declared in `engines`; CI uses Node 22). Check `promptfoo --version` / `node --version`.

`AGENTS.md` is the governing engineering spec (ten 铁律, directory conventions, assertion layering, CI gating). This file describes the **current landed state**; §0.5 of `AGENTS.md` maps its generic `finance.*` examples onto this repo and records all 0.125.1 CLI corrections. `legacy/` holds the pre-restructure flat files (archived, not deleted); `legacy/docs/` holds two superseded design drafts.

## Common commands

Always pass `-c <config>` explicitly. `.env` is auto-loaded by promptfoo from cwd (gitignored; needs `ARK_API_KEY` and `DEEPSEEK_API_KEY`).

```bash
pnpm install                         # first time; lock file is committed
pnpm run eval:smoke                  # 2 cases, fast end-to-end self-check
pnpm run eval                        # main golden regression -> reports/writer.json
pnpm run eval:anchors                # rubric calibration (must be 4/4)
pnpm run eval:redteam                # injection/越权, warn-only
pnpm run eval:all                    # bash scripts/run-all.sh: all 4 suites + summary
pnpm run eval:changed                # git diff -> only affected suites
pnpm run summary                     # node scripts/summary.mjs reports/*.json
pnpm run eval:view                        # web viewer for last run

# Single case / single suite (0.125.1 flags)
pnpm exec promptfoo eval -c evals/suites/writer.yaml --filter-pattern "信号简报"
pnpm exec promptfoo eval -c evals/suites/writer.yaml -n 3          # --filter-first-n 3
node scripts/summary.mjs reports/*.json --gate          # PR gate by pass rate
```

**Flags that do NOT exist in 0.125.1:** `--limit`, `--filter`, `--ci`. Use `--filter-first-n`, `--filter-pattern`, and `summary.mjs --gate` respectively.

## High-level architecture

```
prompts/gzh.writer/          # ★ 唯一权威来源：v0..v3.json (2-message chat arrays) + NOTES.md
evals/
  registry.yaml              # 1 条登记：id=gzh.writer, suites 列表, pass_threshold 0.8
  suites/                    # writer / smoke / judge-anchors / redteam .yaml
  datasets/writer/           # golden / boundary / redteam / smoke .jsonl + fixtures/信号简报
  graders/                   # rubric-writer.txt, judge-prompt-writer.json,
                             # rubric-redteam.txt, judge-prompt-redteam.json, judge-anchors/*.jsonl
  common/                    # forbidden-*.js (确定性断言), providers.yaml (同步来源)
scripts/                     # run-all.sh, changed-suites.mjs, summary.mjs
.github/workflows/prompt-eval.yml
reports/                     # gitignored 产物
legacy/                      # 归档的旧扁平配置
```

**How a run works:** a suite references `prompts/gzh.writer/vN.json` via `file://../../prompts/...` (base = `evals/suites/`). A JSONL row supplies **`vars.news`** — either a task instruction, or `file://../datasets/writer/fixtures/信号简报_20260917.md`. `{{news}}` is rendered into the user message. The tested provider is `deepseek:deepseek-v4-flash`; the **judge is a different model** (`openai:chat:doubao-seed-evolving` / Ark, `temperature: 0`) set under `defaultTest.options.provider` — no self-grading.

`defaultTest.assert` (4 global, layered) = `no_marketing_words` + `no_investment_advice` (JS word/regex checks) + `not_empty` (JS) + `rubric_quality` (`llm-rubric`, `threshold: 8`). Per-case `assert` in JSONL is **additive** (verified: 4 global + 1 per-case = 5 componentResults). Length bounds live per-case because the three topic cases target 400/150/120 字.

**Keeping /10 semantics:** `llm-rubric`'s `value` is `rubric-writer.txt` (criteria), while `defaultTest.options.rubricPrompt` points to `judge-prompt-writer.json` — a chat-array grading template with `{{rubric}}`/`{{output}}`, an anti-injection section, a version header, and a forced `{"score":0-10,"pass":bool,"reason":"..."}`. Without this split, promptfoo's stock 0–1 grader makes `threshold: 8` unreachable. `registry.yaml` `pass_threshold: 0.8` == 8/10.

**Redteam** is deliberately different: it uses `rubric-redteam.txt` + `judge-prompt-redteam.json` (LLM judge) instead of word-list asserts. A correctly-refusing model quotes the attack words while explaining why, and string matching cannot distinguish quoting from complying — it produced stable false positives. Redteam is warn-only and excluded from the gate.

## Gotchas (verified against promptfoo 0.125.1)

- `file://` paths (including ones **inside JSONL** `vars` and `assert.value`) resolve from the **config file's directory**, not cwd. From `evals/suites/`: `../../prompts/...`, `../datasets/...`, `../graders/...`, `../common/...`.
- Only variable is `{{news}}`. Old `{{market}}`/`{{user_input}}` placeholders were never supplied and rendered empty — do not reintroduce永远取不到值的占位符.
- The real test option is `disableDefaultAsserts` (not `disableDefaultAssertions`); global + per-case asserts are concatenated.
- `not-contains` `value` must be a **string/number** — arrays are rejected. Use `javascript` expressions or `contains-any` for multi-value.
- `tags` must be a **record** (`tags: {capability: ..., kind: ...}`), not a YAML list.
- `providers` must be an array; `providers: file://...yaml` is unsupported. Each suite inlines the two provider blocks with `evals/common/providers.yaml` as the single sync source.
- 0.125.1 has **no `cache.namespace` config field** — only `commandLineOptions.cache: true`. Clear cache (`promptfoo cache clear` / `--no-cache`) before A/B comparisons.
- The tested model is a reasoning model: `showThinking: false` keeps reasoning out of the article, but reasoning still consumes tokens. `max_tokens: 8000` is required; `1200` made long-brief cases emit an empty output.
- Word-list asserts are heuristic: bare `在看`/`目标价` are NOT matched (they false-positive on "大家都在看 GPU" and on quoting attack text). Tighten in `evals/common/*.js` and add a matching boundary sample when changing the lists.
- `judge-anchors.yaml` uses `echo` + `{{output}}` to feed fixed candidate texts to the grader; pass anchors use `llm-rubric`, fail anchors `not-llm-rubric`. Calibration is correct when 4/4 pass (observed 9–10 vs 0–1). Re-run it after **any** rubric edit.
- CI/`run-all.sh` enumerate all 4 suites explicitly — do not derive suites from `registry.yaml` (it has one entry; the auxiliary suites would never run). 0.125.1 has no `--ci`; the gate is `summary.mjs --gate`. Per AGENTS.md §11.2 it blocks **only on `golden` (and `regression`) rows of the `writer` suite**; `boundary` / `redteam` / `smoke` / `anchor` cases and the three auxiliary suites are reported but warn-only, even when `metadata.risk: high`. `writer.yaml` includes both `golden.jsonl` and `boundary.jsonl`, so a boundary finding (e.g. the model writing the banned word `暴涨`) legitimately lowers the displayed pass_rate without failing the gate — review it and回灌 a regression sample instead.
- `promptfoo eval` stores results in its local DB; `pnpm run view` works without `-o`. Reports go to gitignored `reports/`.

## Secrets / legacy

- New configs contain **no hardcoded keys**: deepseek reads `DEEPSEEK_API_KEY`, Ark uses `apiKeyEnvar: ARK_API_KEY` + `apiBaseUrl`. Both come from `.env` (or CI secrets).
- `legacy/promptfooconfig.yaml` and `legacy/test.yml` had a hardcoded deepseek key; it was **scrubbed to `apiKeyEnvar`** and moved into `.env`. The value remains in **git history** — rotate it at the provider. Do not rewrite history without asking.
- `legacy/` is for archaeology only. Do not copy its `{{market}}` prompts, commented-out asserts, self-grading judge, or `max_tokens: 120000` into new configs.
- `docs/practice.md` (Langfuse + `import` aggregation) and `docs/prompt-eval-spec.md` ("尚未落地" draft) were archived to `legacy/docs/`; both contradict or predate the landed structure.

## Spec rules that still apply

One capability one suite; assertions layered in `defaultTest.assert`; deterministic assertions before LLM judge; judge ≠ tested model; isolated cache; A/B varies only one dimension (in `writer.yaml`: 2 prompts × 1 provider); bad cases回灌 as JSONL samples; redteam only warns; never lower a threshold to hide a regression (fix the prompt or add samples instead). `prompts/` is the only authoritative prompt source; promptfoo only runs tests.
