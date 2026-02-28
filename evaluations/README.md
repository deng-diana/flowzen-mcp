# Recommendation Evaluation Kit

This folder lets you compare prompt quality objectively.

## Files
- `recommendation_cases.json`: 12 real-world scenarios
- `recommendation_rubric.md`: scoring criteria and weighted formula
- `results/`: generated outputs and scoring summaries

## 1) Generate Baseline Outputs

```bash
ANTHROPIC_API_KEY=... pnpm eval:recommendations generate \
  --profile baseline \
  --out evaluations/results/baseline.json
```

## 2) Generate Candidate Outputs

```bash
ANTHROPIC_API_KEY=... pnpm eval:recommendations generate \
  --profile candidate \
  --out evaluations/results/candidate.json
```

## 3) Compare Scores

```bash
pnpm eval:recommendations compare \
  --baseline evaluations/results/baseline.json \
  --candidate evaluations/results/candidate.json \
  --out evaluations/results/compare-summary.json
```

## Optional: Score a single run

```bash
pnpm eval:recommendations score \
  --actual evaluations/results/candidate.json \
  --out evaluations/results/candidate-summary.json
```

## Notes
- Model defaults to `claude-haiku-4-5-20251001`.
- Override model with `--model` or `FLOWZEN_EVAL_MODEL`.
- The evaluator is heuristic but consistent. Use deltas across the same case set.
