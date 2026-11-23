"""
REAL version of the AI model, using AWS Bedrock's Converse API.

We send the cleaned page summary and ask the model to reply with JSON:
a short summary and up to 5 simple actions. If anything goes wrong
(network, bad JSON), the caller falls back to the mock version.
"""

import json

import boto3

from .. import config
from ..schemas import Action, PageSnapshot

_SYSTEM_PROMPT = """You help elderly and low-tech users use websites.
You get a list of page elements (id, kind, label) and some page text.
Reply with ONLY a JSON object, no other text, in this shape:
{"summary": "<one or two very simple sentences: what this page is for>",
 "actions": [{"element_id": "<id from the list>", "label": "<short, plain words>", "is_payment": <true|false>}]}
Rules:
- At most 5 actions, the most important first.
- Only use element ids that exist in the list.
- Skip ads, cookie banners, newsletters and social links.
- is_payment is true for anything that spends money (pay, buy, order, subscribe, donate, transfer).
- Use words a 75-year-old would understand."""

# Created once and reused. boto3 reads AWS keys or the Bedrock API key from the environment.
_client = None


def _get_client():
    global _client
    if _client is None:
        _client = boto3.client("bedrock-runtime", region_name=config.AWS_REGION)
    return _client


def _page_to_prompt(page: PageSnapshot) -> str:
    elements = "\n".join(f"{e.id} | {e.kind} | {e.label}" for e in page.elements)
    return f"Title: {page.title}\nURL: {page.url}\n\nElements:\n{elements}\n\nPage text:\n{page.text[:3000]}"


def simplify(page: PageSnapshot) -> tuple[str, list[Action]]:
    """Ask Bedrock to simplify the page. Raises an exception on any failure."""
    response = _get_client().converse(
        modelId=config.BEDROCK_MODEL_ID,
        system=[{"text": _SYSTEM_PROMPT}],
        messages=[{"role": "user", "content": [{"text": _page_to_prompt(page)}]}],
        inferenceConfig={"maxTokens": 800, "temperature": 0.2},
    )

    # The reply is a list of content blocks; take the first one that holds text.
    blocks = response["output"]["message"]["content"]
    text = next(block["text"] for block in blocks if "text" in block)

    # Models sometimes wrap JSON in ``` fences; keep only the {...} part.
    data = json.loads(text[text.index("{") : text.rindex("}") + 1])

    # Drop any action that points at an element we never sent (the model made it up).
    valid_ids = {e.id for e in page.elements}
    actions = [Action(**a) for a in data.get("actions", []) if a.get("element_id") in valid_ids]
    return data.get("summary", ""), actions[:5]
