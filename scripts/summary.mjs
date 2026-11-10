#!/usr/bin/env node
// 只读汇总 promptfoo 的 json 报告（AGENTS.md §13）；不改动原始文件。
// --gate 模式：按 registry.yaml 的 pass_threshold 判定「主回归 suite」是否达标。
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const gate = args.includes('--gate');
const files = args.filter((a) => !a.startsWith('--'));

// 只有 writer 是阻断型 golden 回归；smoke / judge-anchors / redteam 仅报告不门禁
const NON_BLOCKING = new Set(['smoke', 'judge-anchors', 'redteam']);
// AGENTS.md §11.2：golden / regression 阻断；boundary / redteam / anchor / smoke 只记录趋势与告警。
// writer suite 里同时含 golden 与 boundary 数据集，门禁必须只按前者计算通过率。
const NON_GATING_CASE_TYPES = new Set(['boundary', 'redteam', 'anchor', 'smoke']);
const isGatingCase = (row) => !NON_GATING_CASE_TYPES.has(caseType(row));

// registry.yaml 极简解析：只取 pass_threshold，不引入 yaml 依赖
function gateThreshold() {
  const f = 'evals/registry.yaml';
  if (!existsSync(f)) return 0.8;
  const m = readFileSync(f, 'utf8').match(/^\s*pass_threshold:\s*([0-9.]+)/m);
  return m ? Number(m[1]) : 0.8;
}

function rowsOf(data) {
  if (Array.isArray(data)) return data;
  const r = data?.results;
  if (Array.isArray(r)) return r;
  if (Array.isArray(r?.results)) return r.results;
  return [];
}

const passed = (row) => {
  if (typeof row?.gradingResult?.pass === 'boolean') return row.gradingResult.pass;
  if (typeof row?.success === 'boolean') return row.success;
  return Number(row?.score ?? 0) > 0;
};
const caseType = (row) => row?.metadata?.case_type ?? row?.testCase?.metadata?.case_type ?? 'unknown';
const risk = (row) => row?.metadata?.risk ?? row?.testCase?.metadata?.risk ?? null;
const description = (row) => row?.testCase?.description ?? row?.description ?? '(无 description)';

// promptfoo 的 row.score 是各断言 score 的均值；本项目 llm-rubric 返回 0~10，
// 与 0~1 的确定性断言混在一起会让均值失去意义，故汇总改用断言通过率（0~1）。
const assertionPassRate = (row) => {
  const cs = row?.gradingResult?.componentResults ?? [];
  if (!cs.length) return passed(row) ? 1 : 0;
  return cs.filter((c) => c.pass).length / cs.length;
};

const date = new Date().toISOString().slice(0, 10);
console.log(`📊 Prompt Eval Summary — ${date}`);
console.log('─'.repeat(72));
console.log('suite'.padEnd(16) + 'cases'.padStart(6) + 'pass_rate'.padStart(12) + 'avg_score'.padStart(12) + 'failed'.padStart(8));

const metrics = new Map();
const failedCases = [];
const highRiskFailures = []; // 展示用：包含非阻断 suite
const blockingHighRiskFailures = []; // 门禁用：只包含阻断型 suite
let gateFailed = false;
const threshold = gateThreshold();
let reportCount = 0;

for (const file of files) {
  if (!existsSync(file)) continue; // 允许 reports/*.json 未展开或为空
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`✗ 无法解析报告 ${file}: ${e.message}`);
    gateFailed = true;
    continue;
  }
  reportCount += 1;
  const suite = path.basename(file, '.json');
  const rows = rowsOf(data);
  const passes = rows.filter(passed).length;
  const fails = rows.length - passes;
  const avg = rows.length
    ? rows.reduce((sum, r) => sum + assertionPassRate(r), 0) / rows.length
    : 0;

  console.log(
    suite.padEnd(16) +
      String(rows.length).padStart(6) +
      (rows.length ? (passes / rows.length).toFixed(2) : 'n/a').padStart(12) +
      avg.toFixed(2).padStart(12) +
      String(fails).padStart(8) +
      (NON_BLOCKING.has(suite) ? '  (非阻断)' : ''),
  );

  for (const row of rows) {
    const ok = passed(row);
    if (!ok) {
      failedCases.push(`${suite}#${description(row)}`);
      if (risk(row) === 'high') {
        highRiskFailures.push(`${suite}#${description(row)}`);
        if (!NON_BLOCKING.has(suite) && isGatingCase(row)) {
          blockingHighRiskFailures.push(`${suite}#${description(row)}`);
        }
      }
    }
    for (const c of row?.gradingResult?.componentResults ?? []) {
      const m = c?.assertion?.metric;
      if (!m) continue;
      const s = metrics.get(m) ?? { pass: 0, total: 0 };
      s.total += 1;
      if (c.pass) s.pass += 1;
      metrics.set(m, s);
    }
  }

  if (gate && !NON_BLOCKING.has(suite)) {
    const gatingRows = rows.filter(isGatingCase);
    const gatingPasses = gatingRows.filter(passed).length;
    const rate = gatingRows.length ? gatingPasses / gatingRows.length : 0;
    if (gatingRows.length === 0 || rate < threshold) {
      console.error(`✗ 门禁未达标: ${suite} golden pass_rate=${rate.toFixed(2)} < ${threshold}`);
      gateFailed = true;
    }
  }
}

console.log('─'.repeat(72));
console.log(`门禁阈值(golden 行): ${threshold}（等价于 /10 打分通过线 ${threshold * 10}）`);
console.log(`高危失败(全部): ${highRiskFailures.length}${highRiskFailures.length ? ' — ' + highRiskFailures.join(', ') : ''}`);
console.log(`高危失败(阻断): ${blockingHighRiskFailures.length}（boundary / smoke / judge-anchors / redteam 只告警，不阻断）`);
if (metrics.size) {
  const worst = [...metrics.entries()]
    .map(([m, s]) => [m, s.pass / s.total])
    .sort((a, b) => a[1] - b[1])[0];
  console.log(`最差 metric: ${worst[0]} (${worst[1].toFixed(2)})`);
}
if (failedCases.length) console.log(`失败 case: ${failedCases.join(' | ')}`);
if (gate && reportCount === 0) console.log('(无报告，门禁跳过)');

if (gate && blockingHighRiskFailures.length) gateFailed = true;
process.exit(gate && gateFailed ? 1 : 0);
