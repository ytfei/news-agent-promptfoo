/**
 * 检查输出中是否出现营销号词汇、套话开头、生硬总结词与营销式引导。
 * 迁移自 legacy/gzh_promptfoo.yml 中注释掉的黑名单 + prompts/ 的「禁用词」。
 *
 * 两条刻意收紧的规则（黑名单原本从未启用，实测后修正，避免误杀）：
 * 1. 不纳入「一定 / 必然」：「不一定」「未必会」等合规表述会误命中；绝对化断言交给 llm-rubric 维度2。
 * 2. CTA 词不裸匹配「在看 / 转发 / 收藏」：正文里「大家都在看 GPU」「转发了一条消息」是正常表述。
 *    只匹配显式引导组合（点赞在看、点在看、转发收藏、欢迎转发、求点赞……）。
 *
 * @param {string} output 模型输出
 * @returns {{pass: boolean, score: number, reason: string}}
 */
module.exports = (output) => {
  const MARKETING = ['引爆', '史诗级', '重磅', '暴涨', '惊天', '必看', '干货满满'];
  const CLICHE = ['综上所述', '一言以蔽之', '由此可见', '在这个飞速发展的时代', '大模型浪潮来临'];
  const CTA = [
    '点赞', '点个赞', '点赞在看', '点在看', '点赞转发', '转发收藏',
    '欢迎转发', '记得收藏', '一键三连', '求点赞', '点赞在看转发收藏',
  ];
  const FORBIDDEN = [...MARKETING, ...CLICHE, ...CTA];

  const text = typeof output === 'string' ? output : String(output ?? '');
  const hits = FORBIDDEN.filter((w) => text.includes(w));

  return {
    pass: hits.length === 0,
    score: hits.length === 0 ? 1 : 0,
    reason: hits.length === 0 ? '无营销词/套话/引导' : `命中禁词: ${hits.join(', ')}`,
  };
};
