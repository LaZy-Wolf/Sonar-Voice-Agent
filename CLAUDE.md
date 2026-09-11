<!-- karpathy-guidelines:start -->
# Karpathy Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. They bias toward caution over
speed; for trivial tasks, use judgment.

## 1. Think before coding

Don't assume. Don't hide confusion. Surface tradeoffs.

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them rather than picking one silently.
- If a simpler approach exists, say so, and push back when warranted.
- If something is unclear, stop, name what is confusing, and ask.

## 2. Simplicity first

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No flexibility or configurability that was not requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.

## 3. Surgical changes

Touch only what you must. Clean up only your own mess.

- Don't improve adjacent code, comments or formatting, and don't refactor what isn't broken.
- Match the existing style, even where you would do it differently.
- Mention unrelated dead code rather than deleting it.
- Remove imports, variables and functions that your own change made unused.

Every changed line should trace directly to the request.

## 4. Goal-driven execution

Define success criteria, then loop until they are verified.

- "Add validation" becomes: write tests for invalid inputs, then make them pass.
- "Fix the bug" becomes: write a test that reproduces it, then make it pass.
- "Refactor X" becomes: tests pass before and after.

For multi-step work, state a brief plan with a verification check per step.
<!-- karpathy-guidelines:end -->
