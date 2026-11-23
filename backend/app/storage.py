"""
Storage for Family Link: ONE interface, two versions.

  SQLiteStorage    a file on this computer (backend/nudi.db). Used by default.
  DynamoStorage    AWS DynamoDB. Used automatically when the three table names
                   are set (FAMILIES_TABLE, EVENTS_TABLE, APPROVALS_TABLE) and
                   AWS credentials exist (or we are running on AWS Lambda).

What is stored (and nothing else):
  families   one record per paired family + short-lived pairing codes
  events     small Nudi events (see family.py for the allowed kinds)
  approvals  payment help requests: website name, amount, reasons, answer

Every record is a plain dict. Events and approvals are keyed by
(family_id, item_id), and item ids start with a timestamp so they sort by time.
"""

import json
import os
import sqlite3
import threading
from pathlib import Path
from typing import Protocol


class Storage(Protocol):
    def get_family(self, family_id: str) -> dict | None: ...
    def put_family(self, family: dict) -> None: ...
    def put_code(self, code: str, family_id: str, expires_at: float) -> None: ...
    def get_code(self, code: str) -> dict | None: ...
    def delete_code(self, code: str) -> None: ...
    def add_event(self, family_id: str, event: dict) -> None: ...
    def list_events(self, family_id: str, limit: int = 100) -> list[dict]: ...
    def put_approval(self, family_id: str, approval: dict) -> None: ...
    def get_approval(self, family_id: str, approval_id: str) -> dict | None: ...
    def list_approvals(self, family_id: str, limit: int = 20) -> list[dict]: ...


# ---------------------------------------------------------------------------
# SQLite (local)
# ---------------------------------------------------------------------------


class SQLiteStorage:
    def __init__(self, path: str):
        # check_same_thread=False + a lock: FastAPI may call us from several threads.
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock:
            self._db.executescript(
                """
                CREATE TABLE IF NOT EXISTS families (id TEXT PRIMARY KEY, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, family_id TEXT NOT NULL, expires_at REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS events (family_id TEXT, id TEXT, data TEXT NOT NULL, PRIMARY KEY (family_id, id));
                CREATE TABLE IF NOT EXISTS approvals (family_id TEXT, id TEXT, data TEXT NOT NULL, PRIMARY KEY (family_id, id));
                """
            )

    def _one(self, sql: str, args: tuple) -> tuple | None:
        with self._lock:
            return self._db.execute(sql, args).fetchone()

    def _all(self, sql: str, args: tuple) -> list[tuple]:
        with self._lock:
            return self._db.execute(sql, args).fetchall()

    def _write(self, sql: str, args: tuple) -> None:
        with self._lock:
            self._db.execute(sql, args)
            self._db.commit()

    def get_family(self, family_id):
        row = self._one("SELECT data FROM families WHERE id = ?", (family_id,))
        return json.loads(row[0]) if row else None

    def put_family(self, family):
        self._write("INSERT OR REPLACE INTO families (id, data) VALUES (?, ?)", (family["family_id"], json.dumps(family)))

    def put_code(self, code, family_id, expires_at):
        self._write("INSERT OR REPLACE INTO codes VALUES (?, ?, ?)", (code, family_id, expires_at))

    def get_code(self, code):
        row = self._one("SELECT family_id, expires_at FROM codes WHERE code = ?", (code,))
        return {"family_id": row[0], "expires_at": row[1]} if row else None

    def delete_code(self, code):
        self._write("DELETE FROM codes WHERE code = ?", (code,))

    def add_event(self, family_id, event):
        self._write("INSERT INTO events VALUES (?, ?, ?)", (family_id, event["id"], json.dumps(event)))

    def list_events(self, family_id, limit=100):
        rows = self._all("SELECT data FROM events WHERE family_id = ? ORDER BY id DESC LIMIT ?", (family_id, limit))
        return [json.loads(r[0]) for r in rows]

    def put_approval(self, family_id, approval):
        self._write("INSERT OR REPLACE INTO approvals VALUES (?, ?, ?)", (family_id, approval["id"], json.dumps(approval)))

    def get_approval(self, family_id, approval_id):
        row = self._one("SELECT data FROM approvals WHERE family_id = ? AND id = ?", (family_id, approval_id))
        return json.loads(row[0]) if row else None

    def list_approvals(self, family_id, limit=20):
        rows = self._all("SELECT data FROM approvals WHERE family_id = ? ORDER BY id DESC LIMIT ?", (family_id, limit))
        return [json.loads(r[0]) for r in rows]


# ---------------------------------------------------------------------------
# DynamoDB (AWS)
# ---------------------------------------------------------------------------


class DynamoStorage:
    """
    families  : partition key "family_id" (pairing codes are stored here too, as "code#123456")
    events    : partition key "family_id", sort key "id"
    approvals : partition key "family_id", sort key "id"
    Records are stored as one JSON string in "data", so numbers need no special handling.
    """

    def __init__(self, families: str, events: str, approvals: str):
        import boto3  # only needed on AWS

        dynamo = boto3.resource("dynamodb")
        self._families = dynamo.Table(families)
        self._events = dynamo.Table(events)
        self._approvals = dynamo.Table(approvals)

    def get_family(self, family_id):
        item = self._families.get_item(Key={"family_id": family_id}).get("Item")
        return json.loads(item["data"]) if item else None

    def put_family(self, family):
        self._families.put_item(Item={"family_id": family["family_id"], "data": json.dumps(family)})

    def put_code(self, code, family_id, expires_at):
        data = json.dumps({"family_id": family_id, "expires_at": expires_at})
        self._families.put_item(Item={"family_id": f"code#{code}", "data": data})

    def get_code(self, code):
        item = self._families.get_item(Key={"family_id": f"code#{code}"}).get("Item")
        return json.loads(item["data"]) if item else None

    def delete_code(self, code):
        self._families.delete_item(Key={"family_id": f"code#{code}"})

    def _newest(self, table, family_id, limit):
        from boto3.dynamodb.conditions import Key

        result = table.query(KeyConditionExpression=Key("family_id").eq(family_id), ScanIndexForward=False, Limit=limit)
        return [json.loads(item["data"]) for item in result.get("Items", [])]

    def add_event(self, family_id, event):
        self._events.put_item(Item={"family_id": family_id, "id": event["id"], "data": json.dumps(event)})

    def list_events(self, family_id, limit=100):
        return self._newest(self._events, family_id, limit)

    def put_approval(self, family_id, approval):
        self._approvals.put_item(Item={"family_id": family_id, "id": approval["id"], "data": json.dumps(approval)})

    def get_approval(self, family_id, approval_id):
        item = self._approvals.get_item(Key={"family_id": family_id, "id": approval_id}).get("Item")
        return json.loads(item["data"]) if item else None

    def list_approvals(self, family_id, limit=20):
        return self._newest(self._approvals, family_id, limit)


# ---------------------------------------------------------------------------
# Choosing one
# ---------------------------------------------------------------------------

_DEFAULT_DB = Path(__file__).resolve().parents[1] / "nudi.db"


def make_storage() -> Storage:
    families = os.getenv("FAMILIES_TABLE")
    events = os.getenv("EVENTS_TABLE")
    approvals = os.getenv("APPROVALS_TABLE")
    on_lambda = bool(os.getenv("AWS_LAMBDA_FUNCTION_NAME"))
    has_aws = on_lambda or bool(os.getenv("AWS_ACCESS_KEY_ID"))
    if families and events and approvals and has_aws:
        return DynamoStorage(families, events, approvals)
    return SQLiteStorage(os.getenv("NUDI_DB_PATH", str(_DEFAULT_DB)))
