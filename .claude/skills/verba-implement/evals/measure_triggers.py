#!/usr/bin/env python3
"""Замер срабатывания скилла verba-implement.

В отличие от скрипта skill-creator, который подсовывает описание скилла
как слэш-команду (в CLI 2.1.173 её нечем вызвать — всегда ноль), здесь
запускается настоящий скилл проекта: `claude -p` в копии репозитория,
где лежит .claude/skills/verba-implement, и ловится вызов инструмента
Skill с skill=verba-implement.

Запуск — из обычного терминала, где `claude -p` залогинен (из Bash-инструмента
сессии Claude Desktop CLI отвечает «Not logged in»):

    rsync -a --exclude node_modules --exclude .git ./ /tmp/verba-probe/
    python3 .claude/skills/verba-implement/evals/measure_triggers.py \
        .claude/skills/verba-implement/evals/trigger-evals.json /tmp/verba-probe 3

Агент в каждом прогоне работает в plan mode и не больше MAXTURNS ходов
(по умолчанию 4): на первом ходу он часто сначала читает файлы и только
потом берёт скилл, поэтому замер по одному ходу занижает срабатывание.
Копия репозитория — страховка, чтобы прогоны точно ничего не тронули.
Результат — trigger-results.json рядом с набором запросов.
"""

import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

SKILL = "verba-implement"
MODEL = "claude-opus-5"
TIMEOUT = 150


def probe(query: str) -> dict:
    cmd = [
        "claude", "-p", query,
        "--output-format", "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--model", MODEL,
        "--permission-mode", "plan",
        "--max-turns", os.environ.get("MAXTURNS", "4"),
    ]
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    started = time.time()
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        cwd=PROJECT, env=env, text=True,
    )
    note = None
    try:
        out, err = proc.communicate(timeout=TIMEOUT)
    except subprocess.TimeoutExpired:
        proc.kill()
        out, err = proc.communicate()
        note = "timeout"

    triggered = False
    other_skills = set()
    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if ev.get("type") == "assistant":
            for block in ev.get("message", {}).get("content", []):
                if block.get("type") == "tool_use" and block.get("name") == "Skill":
                    name = (block.get("input") or {}).get("skill")
                    if name == SKILL:
                        triggered = True
                    elif name:
                        other_skills.add(name)
    if not out.strip() and err.strip():
        note = (note or "") + " stderr: " + err.strip()[:160]
    return {
        "triggered": triggered,
        "other_skills": sorted(other_skills),
        "seconds": round(time.time() - started, 1),
        "note": note,
    }


if __name__ == "__main__":
    evals = json.load(open(sys.argv[1]))
    PROJECT = sys.argv[2]
    runs = int(sys.argv[3]) if len(sys.argv) > 3 else 3

    jobs = [(i, r) for i in range(len(evals)) for r in range(runs)]
    results = {i: [] for i in range(len(evals))}

    def work(job):
        i, _ = job
        return i, probe(evals[i]["query"])

    with ThreadPoolExecutor(max_workers=6) as pool:
        for i, res in pool.map(work, jobs):
            results[i].append(res)
            print(".", end="", flush=True)
    print()

    report = []
    for i, ev in enumerate(evals):
        rs = results[i]
        hits = sum(r["triggered"] for r in rs)
        report.append({
            "query": ev["query"],
            "should_trigger": ev["should_trigger"],
            "hits": hits,
            "runs": len(rs),
            "correct": (hits > len(rs) / 2) == ev["should_trigger"],
            "other_skills": sorted({s for r in rs for s in r["other_skills"]}),
            "notes": [r["note"] for r in rs if r["note"]],
            "seconds": [r["seconds"] for r in rs],
        })

    pos = [r for r in report if r["should_trigger"]]
    neg = [r for r in report if not r["should_trigger"]]
    summary = {
        "recall": round(sum(r["correct"] for r in pos) / len(pos), 2) if pos else None,
        "specificity": round(sum(r["correct"] for r in neg) / len(neg), 2) if neg else None,
        "accuracy": round(sum(r["correct"] for r in report) / len(report), 2),
    }
    out_path = os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])), os.environ.get("OUTNAME", "trigger-results.json"))
    json.dump({"summary": summary, "report": report}, open(out_path, "w"), ensure_ascii=False, indent=2)

    print(json.dumps(summary, ensure_ascii=False))
    for r in report:
        mark = "OK  " if r["correct"] else "MISS"
        want = "+" if r["should_trigger"] else "-"
        print(f'{mark} {want} {r["hits"]}/{r["runs"]}  {r["query"][:70]}')
    print("saved:", out_path)
