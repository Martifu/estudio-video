#!/usr/bin/env python3
"""Credit ledger per run: <run>/ledger.json + <run>/costos.md.

  ledger.py <run> quote --item "hook1 seedance 15s 720p" --credits 105     # estimated cost before spending
  ledger.py <run> job   --item "hook1 seedance 15s 720p" --job-id abc --credits 105 [--clip hook1]   # real spend
  ledger.py <run> cap 600                                                  # set the credit cap for the run
  ledger.py <run> guard 105          # exit 1 if (spent + this) would exceed the cap (no cap set -> exit 0)
  ledger.py <run> report [--usd-per-credit 0.05] [--clips N]               # writes <run>/costos.md
"""
import argparse, json, sys
from datetime import datetime, timezone
from pathlib import Path


def load(run):
    f = Path(run) / "ledger.json"
    return json.loads(f.read_text()) if f.exists() else {"cap": None, "quotes": [], "jobs": []}


def save(run, d):
    Path(run).mkdir(parents=True, exist_ok=True)
    (Path(run) / "ledger.json").write_text(json.dumps(d, indent=2, ensure_ascii=False))


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run")
    ap.add_argument("cmd", choices=["quote", "job", "cap", "guard", "report"])
    ap.add_argument("value", nargs="?", type=float, help="credits for cap/guard")
    ap.add_argument("--item"); ap.add_argument("--job-id"); ap.add_argument("--credits", type=float)
    ap.add_argument("--clip", help="finished-clip name this job belongs to (optional)")
    ap.add_argument("--usd-per-credit", type=float, default=0.05)
    ap.add_argument("--clips", type=int, help="override the number of finished clips for the cost-per-clip figure")
    a = ap.parse_args()
    d = load(a.run)
    spent = sum(j["credits"] for j in d["jobs"])

    if a.cmd in ("quote", "job"):
        if not a.item or a.credits is None:
            sys.exit("--item and --credits are required")
        row = {"item": a.item, "credits": a.credits, "at": now()}
        if a.cmd == "job":
            row.update(job_id=a.job_id, clip=a.clip)
        d["quotes" if a.cmd == "quote" else "jobs"].append(row)
        save(a.run, d)
        print(f"{a.cmd} recorded: {a.item} = {a.credits:g} credits")
    elif a.cmd == "cap":
        if a.value is None:
            sys.exit("cap needs a credit amount")
        d["cap"] = a.value
        save(a.run, d)
        print(f"cap set: {a.value:g} credits (spent so far {spent:g})")
    elif a.cmd == "guard":
        if a.value is None:
            sys.exit("guard needs a credit amount")
        cap = d["cap"]
        if cap is not None and spent + a.value > cap:
            print(f"OVER CAP: spent {spent:g} + {a.value:g} > cap {cap:g}", file=sys.stderr)
            sys.exit(1)
        print(f"ok: spent {spent:g} + {a.value:g} <= cap {cap if cap is not None else 'none'}")
    else:
        usd = a.usd_per_credit
        quoted = sum(q["credits"] for q in d["quotes"])
        clips = a.clips or len({j.get("clip") or j["item"].split()[0] for j in d["jobs"]}) or 0
        L = [f"# Costos - {Path(a.run).resolve().name}", "",
             f"Cap: {d['cap']:g} credits" if d["cap"] is not None else "Cap: not set", "",
             "## Cotizado (estimado antes de gastar)", "", "| Item | Credits | USD (est.) |", "|---|---:|---:|"]
        L += [f"| {q['item']} | {q['credits']:g} | {q['credits'] * usd:.2f} |" for q in d["quotes"]] or ["| - | 0 | 0.00 |"]
        L += ["", "## Gastado (jobs reales)", "", "| Item | Job ID | Credits | USD (est.) |", "|---|---|---:|---:|"]
        L += [f"| {j['item']} | {j.get('job_id') or '-'} | {j['credits']:g} | {j['credits'] * usd:.2f} |" for j in d["jobs"]] or ["| - | - | 0 | 0.00 |"]
        L += ["", f"- Total quoted: **{quoted:g} credits**", f"- Total spent: **{spent:g} credits**",
              f"- USD at {usd:g} USD/credit: **{spent * usd:.2f} USD** (ESTIMATE: the real price depends on the plan; adjust --usd-per-credit)"]
        L.append(f"- Cost per finished clip: **{spent / clips:g} credits ({spent * usd / clips:.2f} USD est.)** over {clips} clip(s)" if clips else "- Cost per finished clip: n/a (no jobs)")
        (Path(a.run) / "costos.md").write_text("\n".join(L) + "\n")
        print("\n".join(L))
        print(f"\n-> {Path(a.run) / 'costos.md'}")


if __name__ == "__main__":
    main()
