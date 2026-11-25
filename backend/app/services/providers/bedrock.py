"""
AWS Bedrock (Converse API). Optional: used only when BEDROCK_MODEL_ID and AWS
credentials are set. boto3 reads the AWS keys or the Bedrock API key from the
environment.
"""

from ... import config

_client = None


def _get_client():
    global _client
    if _client is None:
        import boto3  # only loaded when Bedrock is actually used

        _client = boto3.client("bedrock-runtime", region_name=config.AWS_REGION)
    return _client


def generate(system: str, prompt: str, max_tokens: int, want_json: bool) -> str:
    response = _get_client().converse(
        modelId=config.BEDROCK_MODEL_ID,
        system=[{"text": system}],
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": max_tokens, "temperature": 0.2},
    )
    # The reply is a list of content blocks; take the first one that holds text.
    blocks = response["output"]["message"]["content"]
    return next(block["text"] for block in blocks if "text" in block)
