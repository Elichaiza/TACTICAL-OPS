# ============================================================
# TACTICAL OPS — מנוע שיבוץ CP-SAT (OR-Tools)
# Vercel Python Serverless Function: POST /api/solve
# ============================================================
from http.server import BaseHTTPRequestHandler
from collections import defaultdict
from math import gcd, ceil
import json

from ortools.sat.python import cp_model

SPECIAL_ROLES = {"סמל", "מפקד", "מפקד משימה", "קצין"}
MIN_REST = 480   # 8 שעות מנוחה בין משמרות
MAX_DAILY = 480  # מקסימום 8 שעות ביממה צבאית (10:00-10:00)


def _conflict(a, b):
    """שתי משמרות מתנגשות אם הן חופפות או שאין 8ש' מנוחה ביניהן."""
    if a["startAbs"] <= b["startAbs"]:
        gap = b["startAbs"] - a["endAbs"]
    else:
        gap = a["startAbs"] - b["endAbs"]
    return gap < MIN_REST


def _attempt(problem, use_cap=True, time_limit=9.0):
    """ניסיון פתרון יחיד. use_cap=True מוסיף תקרת שעות הדוקה לאיזון מהיר.
    מחזיר: dict פתרון | {"structural": reasons} | None (אין פתרון בזמן/עם תקרה)."""
    soldiers = problem["soldiers"]   # [{id, role}]
    slots = problem["slots"]         # ראה build בצד הלקוח
    role_of = {s["id"]: s["role"] for s in soldiers}

    model = cp_model.CpModel()

    # ── משתני החלטה: x[(slotKey, soldierId)] ∈ {0,1} ──
    x = {}
    for sl in slots:
        for sid in sl["eligible"]:
            x[(sl["key"], sid)] = model.NewBoolVar(f"x_{sl['key']}_{sid}")

    infeasible_reasons = []

    # ── נעיצות ידניות (forced) — שיבוץ קשיח ──
    for key, sid in problem.get("forced", []):
        if (key, sid) in x:
            model.Add(x[(key, sid)] == 1)

    # ── אילוץ קשיח: איוש מלא (No Holes) — כל משמרת בדיוק כנדרש ──
    for sl in slots:
        vs = [x[(sl["key"], sid)] for sid in sl["eligible"]]
        if len(vs) < sl["needed"]:
            infeasible_reasons.append({"type": "few_eligible", "slot": sl["key"],
                                       "have": len(vs), "need": sl["needed"]})
        if vs:
            model.Add(sum(vs) == sl["needed"])
        elif sl["needed"] > 0:
            infeasible_reasons.append({"type": "no_eligible", "slot": sl["key"]})

    # ── אילוץ קשיח: מינימום בעלי תפקיד מיוחד ──
    for sl in slots:
        if sl.get("minSpecial", 0) > 0:
            sp = [x[(sl["key"], sid)] for sid in sl["eligible"] if role_of.get(sid) in SPECIAL_ROLES]
            if len(sp) >= sl["minSpecial"]:
                model.Add(sum(sp) >= sl["minSpecial"])
            else:
                infeasible_reasons.append({"type": "few_special", "slot": sl["key"]})

    # ── אילוץ קשיח: תפקידי חובה ──
    for sl in slots:
        for r in sl.get("mandatory", []):
            rv = [x[(sl["key"], sid)] for sid in sl["eligible"] if role_of.get(sid) == r]
            if rv:
                model.Add(sum(rv) >= 1)
            else:
                infeasible_reasons.append({"type": "missing_role", "slot": sl["key"], "role": r})

    # ── אילוץ קשיח: חפיפות + מנוחה 8ש' ──
    n = len(slots)
    for i in range(n):
        for j in range(i + 1, n):
            if _conflict(slots[i], slots[j]):
                common = set(slots[i]["eligible"]) & set(slots[j]["eligible"])
                for sid in common:
                    model.Add(x[(slots[i]["key"], sid)] + x[(slots[j]["key"], sid)] <= 1)

    # ── אילוץ קשיח: מכסה יומית 8ש' ביממה צבאית ──
    by_milday = defaultdict(list)
    for sl in slots:
        by_milday[sl["milDay"]].append(sl)
    for s in soldiers:
        sid = s["id"]
        for _, sls in by_milday.items():
            terms = [sl["dur"] * x[(sl["key"], sid)] for sl in sls if (sl["key"], sid) in x]
            if terms:
                model.Add(sum(terms) <= MAX_DAILY)

    # אם זוהתה אי-היתכנות מבנית ודאית — החזר מיד (לא תלוי בתקרה)
    if infeasible_reasons:
        return {"structural": infeasible_reasons}

    # ── עומס שעות לכל חייל ──
    total_demand = sum(sl["dur"] * sl["needed"] for sl in slots)
    # חסם הדוק על עומס: לא יותר מ-8ש' לכל יממה צבאית (מאיץ את הכפל)
    num_mildays = len(set(sl["milDay"] for sl in slots))
    max_load = min(total_demand, num_mildays * MAX_DAILY)
    load = {}
    for s in soldiers:
        sid = s["id"]
        terms = [sl["dur"] * x[(sl["key"], sid)] for sl in slots if (sl["key"], sid) in x]
        lv = model.NewIntVar(0, max_load, f"load_{sid}")
        model.Add(lv == (sum(terms) if terms else 0))
        load[sid] = lv

    # ── תקרת שעות הדוקה (use_cap) — מאיצה דרמטית את האיזון ──
    # cap = ⌈ממוצע⌉ מעוגל מעלה לאורך-משמרת. עם תקרה זו האופטימיזציה
    # האיטית הופכת לבדיקת היתכנות מהירה (כל אחד נדחף קרוב לממוצע).
    if use_cap:
        working = [s["id"] for s in soldiers
                   if any((sl["key"], s["id"]) in x for sl in slots)]
        nw = len(working) or 1
        gran = 0
        for sl in slots:
            gran = gcd(gran, sl["dur"])
        gran = gran or 1
        avg = total_demand / nw
        cap = ceil(avg / gran) * gran
        for sid in working:
            model.Add(load[sid] <= cap)

    # ── מטרה רכה #1: איזון שעות — מזעור סכום ריבועי העומסים ──
    # סך השעות קבוע (איוש מלא) ⇒ מזעור Σload² שקול למזעור השונות = פיזור הכי שווה.
    # זה מאזן את *כל* החיילים סביב הממוצע, ולא רק את הקצוות (max-min).
    sq_terms = []
    for s in soldiers:
        sid = s["id"]
        sqv = model.NewIntVar(0, max_load * max_load, f"sq_{sid}")
        model.AddMultiplicationEquality(sqv, [load[sid], load[sid]])
        sq_terms.append(sqv)
    sum_sq = model.NewIntVar(0, max_load * max_load * max(1, len(soldiers)), "sum_sq")
    model.Add(sum_sq == sum(sq_terms))

    # ── מטרה רכה #2: רוטציה — קנס על אותה משימה יותר מפעם ──
    missions = set(sl["missionId"] for sl in slots)
    excess = []
    for s in soldiers:
        sid = s["id"]
        for m in missions:
            cnt = [x[(sl["key"], sid)] for sl in slots
                   if sl["missionId"] == m and (sl["key"], sid) in x]
            if len(cnt) >= 2:
                ev = model.NewIntVar(0, len(cnt), f"ex_{sid}_{m}")
                model.Add(ev >= sum(cnt) - 1)
                excess.append(ev)
    rot = model.NewIntVar(0, 100000, "rot")
    model.Add(rot == (sum(excess) if excess else 0))

    # האיזון דומיננטי (Σload²), הרוטציה משנית (שובר שוויון)
    model.Minimize(sum_sq * 10000 + rot)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        assign = defaultdict(list)
        for sl in slots:
            for sid in sl["eligible"]:
                if solver.Value(x[(sl["key"], sid)]) == 1:
                    assign[sl["key"]].append(sid)
        loads = [solver.Value(load[s["id"]]) for s in soldiers]
        working = [v for v in loads if v > 0]
        spread = (max(working) - min(working)) if working else 0
        return {
            "feasible": True,
            "optimal": status == cp_model.OPTIMAL,
            "assignments": dict(assign),
            "spread": spread,
            "rotation": solver.Value(rot),
        }
    return None  # אין פתרון (אולי בגלל התקרה) — המתזמן ינסה בלי תקרה


def solve(problem):
    """מתזמן: ניסיון עם תקרה הדוקה (מהיר ומאוזן), ואם נכשל — בלי תקרה, ואם
    גם זה נכשל — אבחון אילו משמרות לא ניתנות למילוי."""
    capped = _attempt(problem, use_cap=True, time_limit=6.0)
    if isinstance(capped, dict) and capped.get("structural"):
        return {"feasible": False, "reasons": capped["structural"]}
    if isinstance(capped, dict) and capped.get("feasible"):
        return capped
    # התקרה אולי גרמה לאי-היתכנות — נסה בלי תקרה
    uncapped = _attempt(problem, use_cap=False, time_limit=3.0)
    if isinstance(uncapped, dict) and uncapped.get("feasible"):
        return uncapped
    # באמת אין פתרון — אבחן אילו משמרות חסרות
    return _relaxed_diagnose(problem)


def _relaxed_diagnose(problem):
    """מודל מקסום-מילוי: אילוצים קשיחים נשמרים, אך משמרת יכולה להישאר חלקית.
    מחזיר אילו משמרות לא הצליחו להתמלא."""
    soldiers = problem["soldiers"]
    slots = problem["slots"]
    role_of = {s["id"]: s["role"] for s in soldiers}

    model = cp_model.CpModel()
    x = {}
    for sl in slots:
        for sid in sl["eligible"]:
            x[(sl["key"], sid)] = model.NewBoolVar(f"x_{sl['key']}_{sid}")

    for sl in slots:
        vs = [x[(sl["key"], sid)] for sid in sl["eligible"]]
        if vs:
            model.Add(sum(vs) <= sl["needed"])  # רך: עד כמה שאפשר

    n = len(slots)
    for i in range(n):
        for j in range(i + 1, n):
            if _conflict(slots[i], slots[j]):
                for sid in set(slots[i]["eligible"]) & set(slots[j]["eligible"]):
                    model.Add(x[(slots[i]["key"], sid)] + x[(slots[j]["key"], sid)] <= 1)

    by_milday = defaultdict(list)
    for sl in slots:
        by_milday[sl["milDay"]].append(sl)
    for s in soldiers:
        sid = s["id"]
        for _, sls in by_milday.items():
            terms = [sl["dur"] * x[(sl["key"], sid)] for sl in sls if (sl["key"], sid) in x]
            if terms:
                model.Add(sum(terms) <= MAX_DAILY)

    model.Maximize(sum(x.values()))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5.0
    status = solver.Solve(model)

    holes = []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for sl in slots:
            got = sum(solver.Value(x[(sl["key"], sid)]) for sid in sl["eligible"])
            if got < sl["needed"]:
                holes.append({"slot": sl["key"], "missionId": sl["missionId"],
                              "have": got, "need": sl["needed"]})
    return {"feasible": False, "reasons": [{"type": "holes", "holes": holes}]}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            problem = json.loads(body)
            result = solve(problem)
            payload = json.dumps(result, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as e:
            payload = json.dumps({"feasible": False, "error": str(e)}, ensure_ascii=False).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    def do_GET(self):
        payload = json.dumps({"status": "ok", "engine": "or-tools cp-sat"}, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
