#!/usr/bin/env node
// git 改动 → 待跑 suite 列表（AGENTS.md §11.1）
// 本项目是单能力仓库，registry.yaml 只有 1 条登记且 depends_on 为空，
// 因此反向依赖闭包暂不需要；若今后新增带 depends_on 的能力，在此补闭包逻辑。

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const ALL = ['writer', 'smoke', 'judge-anchors', 'redteam'];
const cfg = (name) => `evals/suites/${name}.yaml`;

const RULES = [
  { re: /^prompts\//, suites: () => ALL },
  { re: /^evals\/common\//, suites: () => ALL },
  { re: /^evals\/graders\//, suites: () => ALL },
  { re: /^evals\/datasets\//, suites: () => ALL },
  { re: /^evals\/registry\.yaml$/, suites: () => ALL },
  { re: /^evals\/suites\/([a-z-]+)\.yaml$/, suites: (m) => (ALL.includes(m[1]) ? [m[1]] : []) },
  { re: /^scripts\//, suites: () => ALL },
  { re: /^\.github\/workflows\//, suites: () => ALL },
  { re: /^package(?:-lock)?\.json$/, suites: () => ALL },
];

function gitChanged() {
  const found = [];
  const run = (args) => {
    try {
      return execFileSync('git', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return ''; // origin/main 不存在时回退到工作树改动
    }
  };

  for (const args of [
    ['diff', '--name-only', 'origin/main...HEAD'],
    ['diff', '--name-only', 'HEAD'],
  ]) {
    const out = run(args);
    if (out) {
      found.push(...out.split('\n'));
      break;
    }
  }

  // 新增文件（未 git add）不在 git diff 里；本地开发时它们是主要改动，必须纳入。
  // --exclude-standard 会跳过 .env / reports/ 等被 gitignore 的产物。
  const untracked = run(['ls-files', '--others', '--exclude-standard']);
  if (untracked) found.push(...untracked.split('\n'));

  return [...new Set(found.filter(Boolean))];
}

const changed = gitChanged();
const picked = new Set();

if (changed.length === 0) {
  // 无法判定改动范围时（例如浅克隆且工作树干净），宁可全跑，不要静默跳过
  for (const s of ALL) picked.add(s);
} else {
  for (const file of changed) {
    for (const rule of RULES) {
      const m = file.match(rule.re);
      if (m) {
        for (const s of rule.suites(m)) picked.add(s);
        break;
      }
    }
  }
}

const suites = ALL.filter((s) => picked.has(s));
const args = process.argv.slice(2);

if (args.includes('--output-list')) {
  for (const s of suites) console.log(cfg(s));
} else if (args.includes('--run')) {
  if (suites.length === 0) {
    console.log('无相关改动，跳过评测');
    process.exit(0);
  }
  mkdirSync('reports', { recursive: true });
  let failed = false;
  for (const s of suites) {
    console.log(`▶ ${s}`);
    const r = spawnSync(
      'pnpm',
      ['exec', 'promptfoo', 'eval', '-c', cfg(s), '-o', `reports/${s}.json`, '--no-progress-bar'],
      { stdio: 'inherit' },
    );
    if (r.status !== 0) failed = true;
  }
  process.exit(failed ? 1 : 0);
} else {
  console.log(`改动文件: ${changed.length} 个`);
  console.log(`待跑 suite: ${suites.length ? suites.join(', ') : '(无)'}`);
  for (const s of suites) console.log('  -', cfg(s));
}
