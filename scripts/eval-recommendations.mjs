import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASELINE_SYSTEM_PROMPT = `You are Flowzen, a cognitive compass grounded in neuroscience, positive psychology, and counseling psychology.

Your identity:
- A warm, thoughtful coach — like a supportive therapist who also understands productivity
- You prioritise the user's wellbeing and mental state over their to-do list
- You validate before advising: acknowledge how they feel, then gently guide
- If energy is "tired": recommend rest or a very easy task, not demanding work
- You never judge procrastination; you wonder what might help

Your knowledge bases:
- Neuroscience: circadian rhythm, cortisol peaks, post-lunch dip, prefrontal fatigue
- Positive psychology: PERMA, flow, strengths, savoring accomplishments
- Counseling: empathy, non-judgment, motivational interviewing, empowerment
- Performance: GTD, Atomic Habits, stress + rest = growth

Your tone:
- Warm, human, supportive — never prescriptive or cold
- Use "you can" / "this might work" rather than "you should"
- Celebrate small wins; completion matters, not perfection`;

const CANDIDATE_SYSTEM_PROMPT = `You are Flowzen's recommendation engine.
Your job is to choose the best next action using neuroscience + behavioral psychology while staying practical, kind, and precise.

Operating principles:
- Compassion first: never shame, guilt, or pressure the user.
- Scientific honesty: use high-level mechanisms (energy, cognitive load, friction, momentum, recovery). No diagnosis or fake certainty.
- Fidelity: use only provided tasks/context. Never invent task IDs, titles, due dates, or history.
- Actionability: one clear recommendation plus concrete steps that can be done right now.

Decision policy (hard rules):
1) Return exactly one of:
   - a task ID from Allowed task IDs, or
   - null if a short recovery reset is clearly better right now.
2) Mood gating:
   - great: choose high priority first. If no high exists, choose the hardest medium task.
   - okay: if any medium-priority task exists, choose medium priority first. Choose high only if no medium exists.
   - tired: if any low-priority or easy task exists, choose from those only. If all options are hard/high, null is preferred.
3) Never choose excluded IDs.
4) Tie-breakers: nearer due date, lower start friction, user pattern fit.

Output policy:
- Return strict JSON only (no markdown, no prose outside JSON).
- Use this exact schema:
  {
    "recommended_task_id": "task-id-or-null",
    "reason": "2-3 short sentences, <= 80 words",
    "reward": "one specific wellbeing nudge, <= 18 words, exactly one emoji",
    "reward_emoji": "same emoji as in reward",
    "focus_tips": ["tip1", "tip2"]
  }
- reason should naturally include at least 3 mechanism terms from: energy, cognitive load, attention, friction, momentum, recovery, fatigue.
- Include at least one supportive phrase such as "you can" or "one small step".
- focus_tips must be exactly 2 items, each <= 12 words, imperative verb first, immediately executable.
- Prefer action verbs: set, start, write, close, open, disable, block, mute, walk, breathe, drink, schedule.
- Avoid generic lines like "stay focused" or "do your best".`;

const CASES_PATH = resolve(process.cwd(), "evaluations/recommendation_cases.json");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const cur = argv[i];
    if (!cur.startsWith("--")) continue;
    const key = cur.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function usage() {
  console.log(`Usage:
  node scripts/eval-recommendations.mjs generate --profile baseline|candidate --out <path> [--model <name>]
  node scripts/eval-recommendations.mjs score --actual <path> [--out <path>]
  node scripts/eval-recommendations.mjs compare --baseline <path> --candidate <path> [--out <path>]
`);
}

function loadCases() {
  const parsed = JSON.parse(readFileSync(CASES_PATH, "utf-8"));
  return parsed.cases;
}

function buildBaselineUserPrompt(c) {
  const insightLines = [];
  if (c.userInsights && c.userInsights.completionCount > 0) {
    insightLines.push(`- User history: completed ${c.userInsights.completionCount} tasks`);
    if (c.userInsights.bestTimeWindows.length > 0) {
      insightLines.push(`- Most focused during: ${c.userInsights.bestTimeWindows.join(", ")}`);
    }
    if (c.userInsights.recentCompletions.length > 0) {
      insightLines.push(`- Recent wins: ${c.userInsights.recentCompletions.join(", ")}`);
    }
  }

  const excludeNote = c.excludedTaskIds.length > 0
    ? `\n- Do NOT recommend tasks with these IDs: ${c.excludedTaskIds.join(", ")}`
    : "";

  return `Given:
- Time: ${c.currentTime} (${c.timeWindow}, ${c.cognitiveState})
- Mood: ${c.mood}
- Tasks: ${JSON.stringify(c.tasks, null, 2)}${insightLines.length > 0 ? "\n" + insightLines.join("\n") : ""}${excludeNote}

Your job:
1. Recommend ONE task from the list the user should do right now.
   MOOD is the PRIMARY driver — always pick a different task for different moods:
   - mood "great": must pick a HIGH priority task (or MEDIUM if no HIGH exists). Prefer "hard" difficulty.
   - mood "okay": pick a MEDIUM priority task. Prefer "medium" difficulty.
   - mood "tired": pick a LOW priority or "easy" difficulty task ONLY.
2. Explain WHY in 2-3 warm sentences — reference neuroscience or positive psychology.
3. Add ONE warm reward suggestion with an emoji.
4. Provide 1-2 focus_tips.
5. Keep total response under 150 words.

Respond in JSON only:
{
  "recommended_task_id": "uuid or null",
  "reason": "...",
  "reward": "...",
  "reward_emoji": "🎵",
  "focus_tips": ["tip1", "tip2"]
}`;
}

function buildCandidateUserPrompt(c) {
  const insightLines = [];
  if (c.userInsights && c.userInsights.completionCount > 0) {
    insightLines.push(`- User history: completed ${c.userInsights.completionCount} tasks`);
    if (c.userInsights.bestTimeWindows.length > 0) {
      insightLines.push(`- Most focused during: ${c.userInsights.bestTimeWindows.join(", ")}`);
    }
    if (c.userInsights.recentCompletions.length > 0) {
      insightLines.push(`- Recent wins: ${c.userInsights.recentCompletions.join(", ")}`);
    }
  }

  const allowedTaskIds = c.tasks.map((t) => t.id).join(", ");
  const excludeNote = c.excludedTaskIds.length > 0
    ? `\n- Excluded task IDs: ${c.excludedTaskIds.join(", ")}`
    : "";

  return `Given:
- Time: ${c.currentTime} (${c.timeWindow}, ${c.cognitiveState})
- Mood: ${c.mood}
- Allowed task IDs: ${allowedTaskIds || "none"}
- Tasks: ${JSON.stringify(c.tasks, null, 2)}${insightLines.length > 0 ? "\n" + insightLines.join("\n") : ""}${excludeNote}

Task selection constraints:
1. Choose ONE recommended_task_id from Allowed task IDs, or null only if a short recovery reset is clearly better right now.
2. Respect excluded IDs strictly.
3. Mood-first policy:
   - great -> choose high priority first. If no high exists, choose hardest medium.
   - okay -> if any medium-priority task exists, you MUST choose medium priority first.
   - tired -> if any low-priority or easy task exists, you MUST choose from those.
4. If all available tasks are hard/high and user is tired, prefer null + recovery suggestion.
5. Tie-breakers: nearer due date, lower initiation friction, user history patterns.

Writing constraints:
6. reason: 2-3 short sentences, <= 80 words, warm + evidence-based, include at least 3 mechanism terms from: energy/cognitive load/attention/friction/momentum/recovery/fatigue.
7. Include one supportive phrase such as "you can" or "one small step".
8. reward: <= 18 words, specific wellbeing action, include exactly one emoji.
9. reward_emoji must be included and match reward emoji.
10. focus_tips: exactly 2 items, each <= 12 words, start with one of: set/start/write/close/open/disable/block/mute/walk/breathe/drink/schedule.
11. No guilt language. No vague advice.

Respond in strict JSON only:
{
  "recommended_task_id": "uuid or null",
  "reason": "...",
  "reward": "...",
  "reward_emoji": "🎵",
  "focus_tips": ["tip1", "tip2"]
}`;
}

function safeParseJson(raw) {
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

async function generate(profile, outPath, model) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for generate mode.");

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  const cases = loadCases();
  const results = [];

  for (const c of cases) {
    const userPrompt = profile === "baseline" ? buildBaselineUserPrompt(c) : buildCandidateUserPrompt(c);
    const systemPrompt = profile === "baseline" ? BASELINE_SYSTEM_PROMPT : CANDIDATE_SYSTEM_PROMPT;

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 260,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      const rawText = response.content[0]?.type === "text" ? response.content[0].text : "";
      results.push({ id: c.id, title: c.title, rawText, parsed: safeParseJson(rawText) });
      console.log(`[generate] ${profile} ${c.id} done`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ id: c.id, title: c.title, rawText: "", parsed: null, error: message });
      console.log(`[generate] ${profile} ${c.id} failed: ${message}`);
    }
  }

  const output = { profile, model, generatedAt: new Date().toISOString(), results };
  writeFileSync(resolve(process.cwd(), outPath), JSON.stringify(output, null, 2));
  console.log(`[generate] wrote ${outPath}`);
}

function clamp0to5(n) {
  return Math.max(0, Math.min(5, Math.round(n)));
}

function wordCount(s) {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

function scoreFit(c, rec, notes) {
  if (rec.recommended_task_id === null) {
    if (c.allowNull) return c.tasks.length === 0 ? 5 : (c.mood === "tired" ? 4 : 2);
    notes.push("Returned null recommendation when allowNull=false");
    return 0;
  }
  if (typeof rec.recommended_task_id !== "string") {
    notes.push("recommended_task_id is not string|null");
    return 0;
  }
  if (c.excludedTaskIds.includes(rec.recommended_task_id)) {
    notes.push("Recommended an excluded task ID");
    return 0;
  }

  const task = c.tasks.find((t) => t.id === rec.recommended_task_id);
  if (!task) {
    notes.push("Recommended task ID not found in allowed tasks");
    return 0;
  }

  const hasEasyAlt = c.tasks.some((t) => t.difficulty === "easy" || t.priority === "low");
  let score = 0;
  if (c.mood === "great") {
    score += task.priority === "high" ? 3 : task.priority === "medium" ? 2 : 1;
    score += task.difficulty === "hard" ? 2 : task.difficulty === "medium" ? 1 : 0;
  } else if (c.mood === "okay") {
    score += task.priority === "medium" ? 3 : task.priority === "high" ? 2 : 1;
    score += task.difficulty === "medium" ? 2 : task.difficulty === "easy" ? 1 : 0;
  } else {
    score += task.priority === "low" ? 3 : task.priority === "medium" ? 2 : 0;
    score += task.difficulty === "easy" ? 2 : task.difficulty === "medium" ? 1 : 0;
    if ((task.priority === "high" || task.difficulty === "hard") && hasEasyAlt) {
      score -= 2;
      notes.push("Tired mood picked high/hard despite easier alternatives");
    }
  }
  return clamp0to5(score);
}

function scoreScience(rec, notes) {
  const reason = rec.reason.toLowerCase();
  const keywords = ["energy", "circadian", "cortisol", "cognitive", "attention", "fatigue", "friction", "momentum", "recovery", "focus", "brain", "load"];
  const risky = ["diagnose", "disorder", "prescription", "clinical treatment"];

  const hits = keywords.filter((k) => reason.includes(k)).length;
  let score = hits >= 3 ? 5 : hits === 2 ? 4 : hits === 1 ? 3 : 2;
  if (risky.some((r) => reason.includes(r))) {
    score -= 2;
    notes.push("Reason contains over-claiming medical language");
  }
  return clamp0to5(score);
}

function scoreActionability(rec, notes) {
  if (!Array.isArray(rec.focus_tips) || rec.focus_tips.length === 0) {
    notes.push("Missing focus_tips");
    return 0;
  }
  const verbs = ["put", "set", "close", "open", "start", "write", "turn", "disable", "play", "drink", "breathe", "walk", "move", "block", "mute", "schedule"];
  let strongCount = 0;
  for (const tip of rec.focus_tips.slice(0, 2)) {
    const lc = tip.toLowerCase();
    const hasVerb = verbs.some((v) => lc.includes(v));
    const shortEnough = wordCount(tip) <= 16;
    if (hasVerb && shortEnough) strongCount += 1;
  }
  if (strongCount === 2) return 5;
  if (strongCount === 1) return 3;
  notes.push("Focus tips are vague or too long");
  return 1;
}

function scoreTone(rec, notes) {
  const text = `${rec.reason} ${rec.reward}`.toLowerCase();
  const harsh = ["lazy", "no excuses", "failure", "you must", "discipline yourself"];
  const supportive = ["you can", "small step", "gentle", "it's normal", "momentum", "one step"];
  if (harsh.some((w) => text.includes(w))) {
    notes.push("Tone has judgmental/guilt language");
    return 0;
  }
  const supportHits = supportive.filter((w) => text.includes(w)).length;
  return supportHits >= 1 ? 5 : 4;
}

function scoreContract(c, parsed, notes) {
  if (!parsed || typeof parsed !== "object") {
    notes.push("JSON parse failure");
    return { contract: 0, rec: null };
  }

  const rec = parsed;
  let checks = 0;
  if (typeof rec.reason === "string" && rec.reason.trim()) checks += 1; else notes.push("Missing reason");
  if (typeof rec.reward === "string" && rec.reward.trim()) checks += 1; else notes.push("Missing reward");
  const idOk = rec.recommended_task_id === null || typeof rec.recommended_task_id === "string";
  if (idOk) checks += 1; else notes.push("recommended_task_id invalid type");
  if (Array.isArray(rec.focus_tips) && rec.focus_tips.length <= 2) checks += 1; else notes.push("focus_tips invalid shape");
  if (typeof rec.reward_emoji === "string" && rec.reward_emoji.trim()) checks += 1; else notes.push("Missing reward_emoji");

  if (c.tasks.length === 0 && rec.recommended_task_id && typeof rec.recommended_task_id === "string") {
    notes.push("Returned task ID although task list is empty");
  }

  return {
    contract: checks,
    rec: {
      recommended_task_id: rec.recommended_task_id ?? null,
      reason: rec.reason ?? "",
      reward: rec.reward ?? "",
      reward_emoji: rec.reward_emoji ?? "✨",
      focus_tips: Array.isArray(rec.focus_tips) ? rec.focus_tips.filter((v) => typeof v === "string") : [],
    },
  };
}

function scoreCase(c, parsed) {
  const notes = [];
  const contractResult = scoreContract(c, parsed, notes);
  const contract = clamp0to5(contractResult.contract);

  if (!contractResult.rec) {
    return { id: c.id, title: c.title, total: 0, fit: 0, science: 0, actionability: 0, tone: 0, contract, notes };
  }

  const fit = scoreFit(c, contractResult.rec, notes);
  const science = scoreScience(contractResult.rec, notes);
  const actionability = scoreActionability(contractResult.rec, notes);
  const tone = scoreTone(contractResult.rec, notes);
  const total = fit * 7 + science * 5 + actionability * 4 + tone * 2 + contract * 2;
  return { id: c.id, title: c.title, total, fit, science, actionability, tone, contract, notes };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

function summarize(scores) {
  const totals = scores.map((s) => s.total);
  const mean = totals.reduce((a, b) => a + b, 0) / (totals.length || 1);
  return {
    mean: Number(mean.toFixed(2)),
    min: totals.length ? Math.min(...totals) : 0,
    max: totals.length ? Math.max(...totals) : 0,
    p90: percentile(totals, 90),
    cases: scores,
  };
}

function scoreFile(actualPath) {
  const actual = JSON.parse(readFileSync(resolve(process.cwd(), actualPath), "utf-8"));
  const cases = loadCases();
  const map = new Map(actual.results.map((r) => [r.id, r]));

  const caseScores = cases.map((c) => {
    const r = map.get(c.id);
    if (!r) return { id: c.id, title: c.title, total: 0, fit: 0, science: 0, actionability: 0, tone: 0, contract: 0, notes: ["Missing output for case"] };
    if (r.error) return { id: c.id, title: c.title, total: 0, fit: 0, science: 0, actionability: 0, tone: 0, contract: 0, notes: [`Generation error: ${r.error}`] };
    return scoreCase(c, r.parsed);
  });

  return summarize(caseScores);
}

function printSummary(label, summary) {
  console.log(`\n[${label}] mean=${summary.mean} min=${summary.min} max=${summary.max} p90=${summary.p90}`);
  for (const c of summary.cases) {
    console.log(`${c.id} total=${c.total} fit=${c.fit} sci=${c.science} act=${c.actionability} tone=${c.tone} contract=${c.contract}`);
  }
}

async function main() {
  const [command] = process.argv.slice(2);
  const args = parseArgs(process.argv.slice(3));

  if (!command || command === "--help" || command === "help") {
    usage();
    return;
  }

  if (command === "generate") {
    const profile = args.profile;
    const out = args.out;
    const model = args.model ?? process.env.FLOWZEN_EVAL_MODEL ?? "claude-haiku-4-5-20251001";
    if (!profile || !["baseline", "candidate"].includes(profile) || !out) {
      usage();
      process.exit(1);
    }
    await generate(profile, out, model);
    return;
  }

  if (command === "score") {
    if (!args.actual) {
      usage();
      process.exit(1);
    }
    const summary = scoreFile(args.actual);
    printSummary("score", summary);
    if (args.out) {
      writeFileSync(resolve(process.cwd(), args.out), JSON.stringify(summary, null, 2));
      console.log(`[score] wrote ${args.out}`);
    }
    return;
  }

  if (command === "compare") {
    if (!args.baseline || !args.candidate) {
      usage();
      process.exit(1);
    }
    const baseline = scoreFile(args.baseline);
    const candidate = scoreFile(args.candidate);
    printSummary("baseline", baseline);
    printSummary("candidate", candidate);
    const delta = Number((candidate.mean - baseline.mean).toFixed(2));
    console.log(`\n[compare] mean delta (candidate - baseline) = ${delta}`);
    if (args.out) {
      writeFileSync(resolve(process.cwd(), args.out), JSON.stringify({ baseline, candidate, delta }, null, 2));
      console.log(`[compare] wrote ${args.out}`);
    }
    return;
  }

  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
