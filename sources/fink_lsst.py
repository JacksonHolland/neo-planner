"""Fink LSST Kafka consumer utility.

A thin background-thread launcher. Each class module supplies its own
``on_alert`` callable that converts a raw Fink alert dict into a Target
(returning ``None`` to skip). The utility owns Kafka connection, polling,
and error handling. Class modules own filtering and schema mapping.

Credentials come from env vars (``FINK_LSST_SERVER``, ``FINK_LSST_GROUP_ID``).
LSST uses passwordless SASL per Fink's setup; no password is sent.
"""

from __future__ import annotations

import os
import threading
from datetime import datetime, timezone
from typing import Callable, List, Optional

from core.target import Target

OnAlert = Callable[[dict], Optional[Target]]


def start_fink_lsst_consumer(
    topics: List[str],
    on_alert: OnAlert,
    cache: List[Target],
    lock: threading.Lock,
    name: str = "fink_lsst",
) -> threading.Thread:
    """Spawn a daemon thread that polls Fink's LSST Kafka stream forever.

    For each alert, calls ``on_alert(alert_dict)``. If the result is a Target,
    appends to ``cache`` under ``lock``. Deduplicates by ``designation``.
    """
    thread = threading.Thread(
        target=_run, args=(topics, on_alert, cache, lock, name), daemon=True, name=name,
    )
    thread.start()
    return thread


def _run(
    topics: List[str],
    on_alert: OnAlert,
    cache: List[Target],
    lock: threading.Lock,
    name: str,
) -> None:
    try:
        from fink_client.consumer import AlertConsumer
    except ImportError:
        print(f"[{name}] fink-client not installed; consumer disabled")
        return

    server = os.getenv("FINK_LSST_SERVER", "kafka-lsst.fink-broker.org:24499")
    group_id = os.getenv("FINK_LSST_GROUP_ID", os.getenv("FINK_GROUP_ID", "jackson_mit"))
    timeout = int(os.getenv("FINK_POLL_TIMEOUT", "10"))

    try:
        consumer = AlertConsumer(
            topics=topics,
            config={"bootstrap.servers": server, "group.id": group_id},
            survey="lsst",
        )
    except Exception as exc:
        print(f"[{name}] consumer init failed: {exc}")
        return

    print(f"[{name}] connected to {server}; topics={topics}")
    seen: set = set()

    try:
        while True:
            try:
                _topic, alert, _key = consumer.poll(timeout=timeout)
            except Exception as exc:
                print(f"[{name}] poll error: {exc}")
                continue
            if alert is None:
                continue

            try:
                target = on_alert(alert)
            except Exception as exc:
                print(f"[{name}] handler error: {exc}")
                continue
            if target is None:
                continue
            if target.designation in seen:
                continue

            seen.add(target.designation)
            target.updated_at = datetime.now(timezone.utc)
            with lock:
                cache.append(target)
    finally:
        try:
            consumer.close()
        except Exception:
            pass
