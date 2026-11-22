"""Standalone MQTT relay check and daily JSONL recorder."""
import argparse
from datetime import datetime
import json
from pathlib import Path
import sys
import time
import uuid

import paho.mqtt.client as mqtt

TOPICS = "terrarium/terrarium_01/+/+"
LOG_DIR = Path(__file__).resolve().parent / "logs"


def client():
    return mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)


def check(host, port):
    token = uuid.uuid4().hex
    topic = f"diagnostics/terrarium/{token}"
    subscriber = client()
    publisher = client()
    subscribed = False
    matched = False

    def on_subscribe(_client, _data, _mid, codes, _props):
        nonlocal subscribed
        if not codes or any(code.is_failure for code in codes):
            raise RuntimeError("subscription refused")
        subscribed = True

    def on_message(_client, _data, message):
        nonlocal matched
        matched = message.topic == topic and message.payload == token.encode()

    def wait_for(connection, condition, stage):
        deadline = time.monotonic() + 5
        while not condition():
            if time.monotonic() >= deadline:
                raise RuntimeError(f"{stage}: timeout")
            rc = connection.loop(timeout=0.1)
            if rc != mqtt.MQTT_ERR_SUCCESS:
                raise RuntimeError(f"{stage}: {mqtt.error_string(rc)}")

    subscriber.on_subscribe = on_subscribe
    subscriber.on_message = on_message
    stage = "subscriber connection"
    try:
        subscriber.connect_timeout = publisher.connect_timeout = 5
        subscriber.connect(host, port)
        wait_for(subscriber, subscriber.is_connected, stage)
        stage = "subscription"
        rc, _ = subscriber.subscribe(topic, qos=1)
        if rc != mqtt.MQTT_ERR_SUCCESS:
            raise RuntimeError(mqtt.error_string(rc))
        wait_for(subscriber, lambda: subscribed, stage)
        stage = "publisher connection"
        publisher.connect(host, port)
        wait_for(publisher, publisher.is_connected, stage)
        stage = "publish"
        start = time.monotonic()
        sent = publisher.publish(topic, token, qos=1)
        if sent.rc != mqtt.MQTT_ERR_SUCCESS:
            raise RuntimeError(mqtt.error_string(sent.rc))
        stage = "delivery"
        wait_for(subscriber, lambda: matched, stage)
        print(f"PASS {host}:{port}  publish-to-receive {(time.monotonic()-start)*1000:.1f} ms")
    except (OSError, RuntimeError, ValueError) as exc:
        raise RuntimeError(f"{stage} - {exc}") from exc
    finally:
        publisher.disconnect()
        subscriber.disconnect()


def record(host, port):
    LOG_DIR.mkdir(exist_ok=True)
    subscriber = client()

    def on_connect(connection, _data, _flags, reason, _props):
        if reason.is_failure:
            raise RuntimeError(f"connection refused: {reason}")
        rc, _ = connection.subscribe(TOPICS, qos=1)
        if rc != mqtt.MQTT_ERR_SUCCESS:
            raise RuntimeError(mqtt.error_string(rc))

    def on_subscribe(_client, _data, _mid, codes, _props):
        if not codes or any(code.is_failure for code in codes):
            raise RuntimeError("subscription refused")
        print(f"Recording {TOPICS} in {LOG_DIR} (Ctrl+C to stop)", flush=True)

    def on_message(_client, _data, message):
        now = datetime.now().astimezone()
        row = dict(received_at=now.isoformat(timespec="milliseconds"),
                   topic=message.topic, payload=message.payload.decode("utf-8", errors="replace"))
        line = json.dumps(row, ensure_ascii=False)
        with (LOG_DIR / f"{now.date()}.jsonl").open("a", encoding="utf-8") as log:
            print(line, file=log)
        print(line, flush=True)

    subscriber.on_connect = on_connect
    subscriber.on_subscribe = on_subscribe
    subscriber.on_message = on_message
    subscriber.connect_timeout = 5
    subscriber.connect(host, port)
    try:
        subscriber.loop_forever()
    finally:
        subscriber.disconnect()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["check", "record"])
    parser.add_argument("host", nargs="?", default="127.0.0.1")
    parser.add_argument("port", nargs="?", default=1883, type=int, choices=range(1,65536), metavar="PORT")
    args = parser.parse_args()
    try:
        (check if args.mode == "check" else record)(args.host, args.port)
    except KeyboardInterrupt:
        pass
    except (RuntimeError, OSError, ValueError) as exc:
        sys.exit(f"FAIL {exc}")
