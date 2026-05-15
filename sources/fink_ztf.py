"""Fink ZTF Kafka consumer utility.

Mirrors ``sources.fink_lsst`` but targets the ZTF Kafka cluster. ZTF alerts
follow a different schema than LSST (``objectId`` / ``candidate.ra`` etc.);
each class module handles its own schema mapping inside its ``on_alert``.
"""

from __future__ import annotations

import os
import threading
from datetime import datetime, timezone
from typing import Callable, List, Optional

from core.target import Target

OnAlert = Callable[[dict], Optional[Target]]


def start_fink_ztf_consumer(
    topics: List[str],
    on_alert: OnAlert,
    cache: List[Target],
    lock: threading.Lock,
    name: str = "fink_ztf",
) -> threading.Thread:
    """Spawn a daemon thread that polls Fink's ZTF Kafka stream forever."""
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

    server = os.getenv("FINK_ZTF_SERVER", "kafka-ztf.fink-broker.org:24499")
    group_id = os.getenv("FINK_ZTF_GROUP_ID", os.getenv("FINK_GROUP_ID", "jackson_mit"))
    timeout = int(os.getenv("FINK_POLL_TIMEOUT", "10"))

    try:
        consumer = AlertConsumer(
            topics=topics,
            config={"bootstrap.servers": server, "group.id": group_id},
            survey="ztf",
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
