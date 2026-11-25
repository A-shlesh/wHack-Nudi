# One small file per AI service. Each has the same function:
#   generate(system, prompt, max_tokens, want_json) -> reply text
# and raises an exception on any failure (llm.py then tries the next one).
