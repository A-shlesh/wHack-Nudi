"""
Entry point for AWS Lambda.

Mangum turns an API Gateway request into a normal web request for our
FastAPI app, and the reply back again. Locally we use uvicorn instead.
lifespan="off": the app has no startup/shutdown steps to run.
"""

from mangum import Mangum

from .main import app

handler = Mangum(app, lifespan="off")
