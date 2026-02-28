# Flowzen Recommendation Rubric

## What Is a Rubric? (12-year-old version)
A rubric is a **score card with clear rules**.
Instead of saying “this feels good,” we score each answer the same way every time.
That makes “before vs after” comparisons fair.

## Scoring Dimensions (100 points total)

### 1) Recommendation Fit (35 pts)
- Does it choose a task that matches mood policy?
- Does it avoid excluded IDs?
- Does it avoid obviously bad picks (e.g., hard/high when tired, if easier options exist)?

Scoring guide:
- 5 = excellent fit
- 4 = good fit, minor mismatch
- 3 = acceptable but not ideal
- 2 = weak fit
- 1 = poor fit
- 0 = invalid pick or excluded ID

### 2) Scientific + Behavioral Reasoning (25 pts)
- Reason references plausible mechanisms (energy rhythm, cognitive load, momentum, friction).
- No fake medical certainty or diagnosis.
- Links recommendation to current state/time.

Scoring guide:
- 5 = specific, grounded, credible
- 3 = generic but acceptable
- 0 = incorrect or fabricated claims

### 3) Actionability of Focus Tips (20 pts)
- 1-2 concrete actions, immediately executable.
- Not vague (“focus more”).
- Fits user mood and task type.

Scoring guide:
- 5 = concrete + practical + low-friction
- 3 = partly actionable
- 0 = vague or irrelevant

### 4) Tone & Safety (10 pts)
- Warm, non-judgmental, no shame/guilt.
- Encouraging and realistic.

Scoring guide:
- 5 = supportive and safe
- 3 = neutral
- 0 = guilt-heavy or judgmental

### 5) Output Contract Compliance (10 pts)
- Strict JSON shape and valid fields.
- `reason`/`reward` present and non-empty.
- `focus_tips` clean and bounded.

Scoring guide:
- 5 = fully compliant
- 3 = minor formatting/content issue
- 0 = parse failure or missing required content

## Weighted Score Formula

For each case:
- `total = fit*7 + science*5 + actionability*4 + tone*2 + contract*2`

Because each component is 0-5, total naturally maps to 0-100.

## Quality Gates
- `>= 85`: production-quality recommendation behavior
- `75-84`: acceptable, improve weak dimensions
- `60-74`: inconsistent, not ready for production claims
- `< 60`: major issues

## Pass Criteria for Prompt Upgrade
- Mean score improvement >= 5 points over baseline
- No regression > 8 points on any critical case (`C01`, `C04`, `C09`)
- Contract compliance score average >= 4.5 / 5

