// Prompt templates. {{name}} placeholders are filled by build(); any template
// can be overridden from the options page.
(function (root) {
  const YSN = (root.YSN = root.YSN || {});

  const TYPES = ['lecture', 'tutorial', 'worked-problems', 'list', 'documentary', 'interview', 'other'];

  // Extra rule added to every section prompt, chosen by the type Gemini reports in pass 1.
  const TYPE_RULES = {
    lecture:
      'This is a lecture: state each concept, its definition, the reasoning or derivation behind it, and every example used to illustrate it. Write formulas out in full.',
    tutorial:
      'This is a tutorial: record every step in order as a numbered list, with the exact commands, code, settings, menu paths, values and tools used, and what each step achieves. Note warnings and common mistakes.',
    'worked-problems':
      'This video works through problems: for each one give the problem statement, every solution step with the intermediate results, the final answer, and the technique or rule applied at each step.',
    list:
      'This video goes through a list of items: cover every single item, and for each one record every attribute mentioned (names, dates, numbers, features, reasons). Use a table where the items share attributes, followed by bullets for details that do not fit the table.',
    documentary:
      'This is an explainer or documentary: record every fact, name, date, number, place, cause and consequence in the order presented, including small details and anecdotes.',
    interview:
      'This is an interview or discussion: record each claim, argument, piece of evidence and recommendation, and say who made it. Note disagreements between speakers.',
    other: 'Record everything of substance that is said or shown, in order.',
  };

  const DEFAULTS = {
    outline: [
      'I am making complete study notes for this video ("{{title}}", {{duration}} long). First, map it out.',
      'Line 1 of your reply must be "TYPE: " followed by the single best fit from: ' + TYPES.join(', ') + '.',
      'Then give a timestamped outline covering the ENTIRE video from 0:00 to {{duration}} with no gaps, one line per section, each exactly in the form:',
      'M:SS-M:SS Section title',
      'Follow the real topic changes in the video. Do not write any notes yet, only the type line and the outline.',
    ].join('\n'),

    section: [
      'Write exhaustive study notes for ONLY the part of the video from {{start}} to {{end}} ({{titles}}).',
      'Rules:',
      '- Do not summarise or compress. If it is said or shown in this range it belongs in the notes: every fact, definition, name, date, number, unit, example, reason, cause and effect, caveat and anecdote.',
      '- One point per bullet, in the order they occur, each starting with its timestamp in parentheses.',
      '- Bold key terms the first time they appear. Use a markdown table when several items share the same attributes.',
      '- {{typeRule}}',
      '- Start each topic with a "### " heading. No introduction, no closing remarks, no offers of further help.',
      '- Stay inside {{start}} to {{end}} and cover it right up to {{end}}. Do not repeat earlier sections.',
    ].join('\n'),

    retry: [
      'That reply is not acceptable for study notes: {{issues}}.',
      'Write the notes for {{start}} to {{end}} again, in full, following the same rules. Cover the whole range up to {{end}} and leave nothing out.',
    ].join('\n'),

    gap: [
      'Final check. Compare the notes you have written in this conversation against the whole video.',
      'List every substantive point (fact, definition, number, example, step, caveat) from the video that is missing from the notes, as bullets that each start with a timestamp in parentheses.',
      'If nothing substantive is missing, reply with exactly: NOTHING MISSING',
    ].join('\n'),
  };

  function fill(template, vars) {
    return template.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  }

  // overrides: {outline?, section?, retry?, gap?}; blank strings fall back to the default.
  function build(kind, vars, overrides) {
    const custom = overrides && typeof overrides[kind] === 'string' && overrides[kind].trim();
    return fill(custom ? overrides[kind] : DEFAULTS[kind], vars || {});
  }

  function typeRule(type) {
    return TYPE_RULES[type] || TYPE_RULES.other;
  }

  YSN.prompts = { TYPES, TYPE_RULES, DEFAULTS, fill, build, typeRule, VERSION: 1 };
  if (typeof module !== 'undefined') module.exports = YSN.prompts;
})(globalThis);
