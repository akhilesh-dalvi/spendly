---
name: worth-building
description: Use when asked to rate a Spendly idea, suggest how to improve it, or decide what’s worth building first. Evaluate Web, CLI, and backend features, fixes, and improvements without implementing them.
---

# Worth building

When I ask you to rate an idea, tell me if it’s worth building and how to make it better without changing what I want. Keep it short, natural, and specific. Evaluation is read-only: no implementation, file edits, tickets, or live mutations. A recommendation isn’t approval to build.

## How to evaluate

1. **Understand my intent.** State the problem, desired outcome, and affected surface. Check the relevant code, tests, and docs. Point to relevant evidence and label assumptions. Ask one focused question only if the answer would materially change the recommendation; otherwise proceed and flag uncertainty.
2. **Rate the original.** Score what I actually proposed, not features or safeguards I didn’t ask for. Call out the biggest weakness if there is one.
3. **Improve it.** Suggest up to three changes that actually help. Say what each changes, why it helps, and any trade-off. Keep the essential behavior. If nothing is worth changing, say so.
4. **Re-rate and recommend.** Rate the recommended version as a projected estimate, including any trade-offs that lower a score. Keep scores unchanged unless a refinement affects them. Don’t raise confidence based on validation that hasn’t happened.

**Safety gate:** Before recommending any version, check financial correctness, privacy, security, and data integrity. A version that fails this check isn’t safe to build, regardless of its score. Suggest a safer version if it preserves my intent. If a material safety question about the recommended version is still open, choose **Validate first** and say what to verify.

**Fixes:** Assess severity separately; rare bugs can still be urgent. Recommend **Fix now** for a credible critical defect involving financial correctness, privacy, security, or data loss. Separate the essential correction from optional extras.

**Multiple ideas:** Rate and refine each idea separately with the same rubric; don’t give the group one score. Give each idea its own verdict, then suggest what to do first and what to validate, defer, or drop. Explain when urgency, safety, or dependencies matter more than the scores.

## Scoring

Use whole-number ratings from 1–10 (10 is best): 1–3 weak, 4–6 mixed, 7–8 strong, 9–10 exceptional. Weighted total = Σ(rating × weight) / 100. Effort and complexity stay out of the score. Don’t chase a 10 or use a score cutoff to decide.

| Parameter | Weight | What to consider |
| --- | ---: | --- |
| User Impact | 30% | How important is the problem, and how much does the idea help? |
| Usage Frequency | 15% | How often does it help? Capture rare but serious consequences under impact or severity. |
| Product Alignment | 20% | Does it fit what Spendly is for? |
| UX / DX Improvement | 15% | Does it reduce steps, confusion, or friction? |
| Technical Risk / Safety | 10% | How safe is it for financial correctness, permissions, privacy, and existing behavior? |
| Maintainability | 5% | Does it fit existing patterns and stay reasonable to maintain? |
| Confidence in Need | 5% | What evidence supports the need and likely benefit? |

## Response

- **Intent:** One or two sentences, including any material assumption.
- **Improvements:** Up to three actionable changes with benefits and trade-offs. Omit if none.
- **Ratings:** `Parameter | Weight | Original | Original reason | Refined (projected) | Refined reason`. Give a short, specific reason for every score, including why unchanged scores stay the same. Show both weighted totals to two decimals. If you recommend no refinement, use the same scores and mark the version unchanged.
- **Affected areas:** Check Web, CLI, backend/API, shared data/migrations, unit/integration/E2E tests, CLI help/docs/README, web docs, marketing/pricing, onboarding, release notes, analytics, and CI/deploy. Show only relevant areas as `Area | Update? (Yes / No / Check) | What/why`. Use **Check** when you couldn’t verify whether an update is needed.
### Recommendation

Use a short bullet list, not a table:

- **Verdict:** Pick **Implement as-is**, **Implement refined**, **Validate first**, **Backlog**, **Drop**, or **Fix now**. Follow the label with 1–3 short sentences: for **Validate first**, name the specific uncertainty, what to check, and what result would let you proceed; for **Implement as-is** or **Implement refined**, say why this version is worth shipping; for **Backlog**, say why it can wait and what would bring it back; for **Drop**, name the decisive reason; for **Fix now**, state the severity and why the fix is urgent.
- **Effort / complexity:** Low, Medium, or High effort; complexity out of 10. Note material blockers or breaking changes; say if none are expected.
- **Next step:** Give the concrete action if it adds detail beyond the verdict. A recommendation is not approval to act.
- **Scope:** Where applicable, state the smallest scope I could approve (conditional on validation when needed) and what stays out.
