"""Summarize the daily MQTT recorder log using local reception times."""
import argparse
import json
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parent / "logs"
TYPES = ("heartbeat", "summary", "event", "alert", "fault")


def report(path):
    if not path.is_file():
        print(f"수신 로그가 없습니다: {path}")
        return

    counts = defaultdict(lambda: defaultdict(int))
    beats = defaultdict(list)
    first = last = None
    skipped = 0
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            try:
                row = json.loads(line)
                group, enclosure, node, kind = row["topic"].split("/")
                stamp = datetime.fromisoformat(row["received_at"])
                if (group, enclosure) != ("terrarium", "terrarium_01") or not node or not kind or stamp.tzinfo is None:
                    raise ValueError()
            except (ValueError, KeyError, TypeError, AttributeError):
                skipped += 1
                continue
            counts[node][kind] += 1
            if kind == "heartbeat":
                beats[node].append(stamp)
            first = min(first, stamp) if first else stamp
            last = max(last, stamp) if last else stamp

    print(f"분석 파일: {path.name}")
    if first:
        print(f"최초 ~ 마지막 수신: {first.isoformat()} ~ {last.isoformat()} ({(last-first).total_seconds():.3f}초)")
    else:
        print("유효한 수신 기록이 없습니다.")
    for node, topics in sorted(counts.items()):
        print(f"\n[{node}] 총 {sum(topics.values())}건")
        for kind in (*TYPES, *sorted(topics.keys() - set(TYPES))):
            print(f"  {kind:<12} {topics.get(kind, 0)}건")
        times = sorted(beats[node])
        if len(times) >= 2:
            gap, start, end = max((b-a, a, b) for a, b in zip(times, times[1:]))
            print(f"  heartbeat 최대 수신 간격: {gap.total_seconds():.3f}초 ({start.time()} ~ {end.time()})")
        else:
            print("  heartbeat 최대 수신 간격: 계산하려면 2건 이상 필요")
    if skipped:
        print(f"분석에서 제외한 잘못된 기록: {skipped}줄")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("date", nargs="?", type=date.fromisoformat, default=date.today(), metavar="YYYY-MM-DD")
    args = parser.parse_args()
    report(LOG_DIR / f"{args.date}.jsonl")
