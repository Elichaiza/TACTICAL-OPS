# ============================================================
# TACTICAL OPS — מנוע שיבוץ CP-SAT (OR-Tools)
# Vercel Python Serverless Function: POST /api/solve
# ============================================================
from http.server import BaseHTTPRequestHandler
from collections import defaultdict
from datetime import date, timedelta
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


def _add_daily_limits(model, soldiers, slots, x):
    """מכסת 8ש' לכל חלון יממה צבאית (10:00→10:00).
    סופר את החפיפה האמיתית של כל משמרת עם כל חלון — כולל משמרות
    שחוצות את גבול ה-10:00 (מתפצלות בין שני חלונות)."""
    # חלונות מתחילים ב-10:00 (=600 דק') כל 1440 דק'
    starts = set()
    for sl in slots:
        k = (sl["startAbs"] - 600) // 1440
        starts.update((k - 1, k, k + 1))
    for s in soldiers:
        sid = s["id"]
        for k in starts:
            ws = 600 + k * 1440
            terms = []
            for sl in slots:
                if (sl["key"], sid) not in x:
                    continue
                ov = min(sl["endAbs"], ws + 1440) - max(sl["startAbs"], ws)
                if ov > 0:
                    terms.append(ov * x[(sl["key"], sid)])
            if terms:
                model.Add(sum(terms) <= MAX_DAILY)


def _attempt(problem, use_cap=True, optimize=True, time_limit=9.0):
    """ניסיון פתרון יחיד. use_cap=True מוסיף תקרת שעות; optimize=True מוסיף מטרת
    איזון. optimize=False = רק למצוא פתרון חוקי (מהיר ואמין).
    מחזיר: dict פתרון | {"structural": reasons} | None (אין פתרון בזמן)."""
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

    # ── אילוץ קשיח: מכסה יומית 8ש' לכל חלון יממה צבאית (עם פיצול נכון) ──
    _add_daily_limits(model, soldiers, slots, x)

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

    rot = None
    if optimize:
        # ── מטרת איזון: מזעור Σload² (אופטימום יחיד → CP-SAT מוכיח מהר עם תקרה) ──
        sq_terms = []
        for s in soldiers:
            sid = s["id"]
            sqv = model.NewIntVar(0, max_load * max_load, f"sq_{sid}")
            model.AddMultiplicationEquality(sqv, [load[sid], load[sid]])
            sq_terms.append(sqv)
        sum_sq = model.NewIntVar(0, max_load * max_load * max(1, len(soldiers)), "sum_sq")
        model.Add(sum_sq == sum(sq_terms))
        model.Minimize(sum_sq)

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
            "optimal": status == cp_model.OPTIMAL or spread == 0,
            "assignments": dict(assign),
            "spread": spread,
            "rotation": solver.Value(rot) if rot is not None else 0,
        }
    return None  # אין פתרון בזמן הנתון


def _scan_violations(problem, assign):
    """סורק שיבוץ ומחזיר רשימת הפרות חוק קריאות."""
    slots = {sl["key"]: sl for sl in problem["slots"]}
    role_of = {s["id"]: s["role"] for s in problem["soldiers"]}
    per = {}
    for k, ids in assign.items():
        for sid in ids:
            per.setdefault(sid, []).append(slots[k])
    V = []
    for sid, sls in per.items():
        ss = sorted(sls, key=lambda s: s["startAbs"])
        for i in range(len(ss)):
            for j in range(i + 1, len(ss)):
                gap = ss[j]["startAbs"] - ss[i]["endAbs"]
                if 0 <= gap < MIN_REST:
                    V.append({"type": "rest", "soldier": sid,
                              "slotA": ss[i]["key"], "slotB": ss[j]["key"], "gap": gap})
        starts = set()
        for sl in sls:
            k = (sl["startAbs"] - 600) // 1440
            starts.update((k - 1, k, k + 1))
        for k in starts:
            ws = 600 + k * 1440
            tot = sum(max(0, min(sl["endAbs"], ws + 1440) - max(sl["startAbs"], ws)) for sl in sls)
            if tot > MAX_DAILY:
                V.append({"type": "daily", "soldier": sid, "date": _date_from_k(k), "minutes": tot})
    for k, sl in slots.items():
        got = assign.get(k, [])
        if len(got) < sl["needed"]:
            V.append({"type": "unfilled", "slot": k, "have": len(got), "need": sl["needed"]})
        for r in sl.get("mandatory", []):
            if not any(role_of.get(s) == r for s in got):
                V.append({"type": "role", "slot": k, "role": r})
        sp = sum(1 for s in got if role_of.get(s) in SPECIAL_ROLES)
        if sp < sl.get("minSpecial", 0):
            V.append({"type": "special", "slot": k, "have": sp, "need": sl["minSpecial"]})
    return V


def _attempt_force(problem, time_limit=7.0, balance=False, hard_safety=False):
    """ממלא משמרות ככל האפשר.
    hard_safety=True  → מנוחה 8ש' + מכסה 8ש'/יממה + חפיפה הם חוקים *קשיחים*
                        שלא נשברים; אם אי-אפשר למלא — משאיר חורים (לשיבוץ הרגיל).
    hard_safety=False → מילוי כפוי: ממלא הכל, מותר לשבור מנוחה/מכסה (מדווח)."""
    soldiers = problem["soldiers"]
    slots = problem["slots"]
    role_of = {s["id"]: s["role"] for s in soldiers}
    model = cp_model.CpModel()
    x = {}
    for sl in slots:
        for sid in sl["eligible"]:
            x[(sl["key"], sid)] = model.NewBoolVar(f"x_{sl['key']}_{sid}")
    for key, sid in problem.get("forced", []):
        if (key, sid) in x:
            model.Add(x[(key, sid)] == 1)
    pen = []
    unfilled = []
    # מילוי: בטיחות-קשיחה → רך (≤נדרש, ממקסמים מילוי); כפוי → ==נדרש
    for sl in slots:
        vs = [x[(sl["key"], sid)] for sid in sl["eligible"]]
        if not vs:
            continue
        cap_fill = min(sl["needed"], len(vs))
        if hard_safety:
            model.Add(sum(vs) <= cap_fill)
            uf = model.NewIntVar(0, cap_fill, f"uf_{sl['key']}")
            model.Add(uf == cap_fill - sum(vs))
            unfilled.append(uf)
        else:
            model.Add(sum(vs) == cap_fill)
    n = len(slots)
    for i in range(n):
        for j in range(i + 1, n):
            a, b = slots[i], slots[j]
            common = set(a["eligible"]) & set(b["eligible"])
            if not common:
                continue
            overlap = a["startAbs"] < b["endAbs"] and b["startAbs"] < a["endAbs"]
            gap = (b["startAbs"] - a["endAbs"]) if a["startAbs"] <= b["startAbs"] else (a["startAbs"] - b["endAbs"])
            for sid in common:
                if overlap:
                    model.Add(x[(a["key"], sid)] + x[(b["key"], sid)] <= 1)  # פיזי — תמיד קשיח
                elif 0 <= gap < MIN_REST:
                    if hard_safety:
                        model.Add(x[(a["key"], sid)] + x[(b["key"], sid)] <= 1)  # מנוחה — קשיח
                    else:
                        v = model.NewBoolVar(f"rest_{a['key']}_{b['key']}_{sid}")
                        model.Add(v >= x[(a["key"], sid)] + x[(b["key"], sid)] - 1)
                        pen.append(v * 100)
    starts = set()
    for sl in slots:
        k = (sl["startAbs"] - 600) // 1440
        starts.update((k - 1, k, k + 1))
    for s in soldiers:
        sid = s["id"]
        for k in starts:
            ws = 600 + k * 1440
            terms = []
            for sl in slots:
                if (sl["key"], sid) not in x:
                    continue
                ov = min(sl["endAbs"], ws + 1440) - max(sl["startAbs"], ws)
                if ov > 0:
                    terms.append(ov * x[(sl["key"], sid)])
            if terms:
                if hard_safety:
                    model.Add(sum(terms) <= MAX_DAILY)  # מכסה יומית — קשיח
                else:
                    ex = model.NewIntVar(0, 100000, f"ex_{sid}_{k}")
                    model.Add(ex >= sum(terms) - MAX_DAILY)
                    pen.append(ex)  # מכסה יומית — דקות חריגה
    for sl in slots:
        for r in sl.get("mandatory", []):
            rv = [x[(sl["key"], sid)] for sid in sl["eligible"] if role_of.get(sid) == r]
            miss = model.NewBoolVar(f"mr_{sl['key']}_{r}")
            if rv:
                model.Add(sum(rv) == 0).OnlyEnforceIf(miss)
                model.Add(sum(rv) >= 1).OnlyEnforceIf(miss.Not())
            else:
                model.Add(miss == 1)
            pen.append(miss * 500)
        if sl.get("minSpecial", 0) > 0:
            sp = [x[(sl["key"], sid)] for sid in sl["eligible"] if role_of.get(sid) in SPECIAL_ROLES]
            short = model.NewIntVar(0, sl["needed"], f"sp_{sl['key']}")
            model.Add(short >= sl["minSpecial"] - (sum(sp) if sp else 0))
            pen.append(short * 300)
    # מטרה: הפרות/חורים (×10000, גוברים) ואז איזון עומס (maxL, שובר שוויון)
    viol = sum(pen) if pen else 0
    if unfilled:
        viol = viol + sum(unfilled) * 10000   # חור = חמור כמו ~100 הפרות מנוחה
    obj = viol * 10000
    if balance:
        active = [s["id"] for s in soldiers
                  if any((sl["key"], s["id"]) in x for sl in slots)]
        maxL = model.NewIntVar(0, MAX_DAILY * 31, "maxL")
        for sid in active:
            terms = [sl["dur"] * x[(sl["key"], sid)] for sl in slots if (sl["key"], sid) in x]
            if terms:
                model.Add(maxL >= sum(terms))
        obj = obj + maxL
    model.Minimize(obj)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"feasible": False, "reasons": [{"type": "holes", "holes": []}],
                "summary": _diagnose_summary(problem, [])}
    assign = defaultdict(list)
    for sl in slots:
        for sid in sl["eligible"]:
            if solver.Value(x[(sl["key"], sid)]) == 1:
                assign[sl["key"]].append(sid)
    return {"feasible": True, "forced_fill": True, "assignments": dict(assign),
            "violations": _scan_violations(problem, dict(assign))}


def _result_from_assign(problem, assign, optimal=False):
    """בונה תוצאת feasible מאובייקט שיבוץ."""
    slots = {sl["key"]: sl for sl in problem["slots"]}
    loadv = {}
    for k, ids in assign.items():
        for sid in ids:
            loadv[sid] = loadv.get(sid, 0) + slots[k]["dur"]
    vals = [v for v in loadv.values() if v > 0]
    spread = (max(vals) - min(vals)) if vals else 0
    return {"feasible": True, "optimal": optimal or spread == 0,
            "assignments": assign, "spread": spread, "rotation": 0}


def solve(problem):
    """מתזמן:
    1. מסלול מהיר — שיבוץ מאוזן (תקרה + Σload²). פותר את רוב הבעיות מהר ומושלם.
    2. אם נכשל — סולבר ממזער-הפרות (force) הוא מנוע מציאת-פתרון אמין: אם הוא משיג
       0 הפרות, קיים שיבוץ חוקי מלא ⇒ מחזירים אותו. כך בעיות צמודות-במיוחד עדיין
       נפתרות, ואף פעם לא מוכרז כשל שגוי על בעיה פתירה.
    3. אם גם force לא משיג 0 הפרות — הבעיה באמת over-constrained ⇒ אבחון + שיבוץ חלקי.
    mode=force → מילוי כפוי שמותר לו לשבור מנוחה/מכסה (עם דיווח הפרות)."""
    if problem.get("mode") == "force":
        return _attempt_force(problem, time_limit=45.0, balance=True, hard_safety=False)

    # מסלול מהיר לבעיות אחידות: תקרה מאיצה דרמטית. אם התקרה שוברת (זמינות מעורבת)
    # — המסלול נכשל ונופל אוטומטית לסולבר האיטי-אופטימלי למטה.
    opt = _attempt(problem, use_cap=True, optimize=True, time_limit=5.0)
    if isinstance(opt, dict) and opt.get("feasible"):
        return opt
    structural = opt.get("structural") if isinstance(opt, dict) else None
    if structural:
        diag = _relaxed_diagnose(problem)
        diag["reasons"] = structural + diag.get("reasons", [])
        return diag

    # מסלול אמין: בטיחות קשיחה — מנוחה+מכסה+חפיפה לעולם לא נשברים; מילוי מקסימלי + איזון
    forced = _attempt_force(problem, time_limit=45.0, balance=True, hard_safety=True)
    if isinstance(forced, dict) and forced.get("feasible"):
        viols = forced.get("violations", [])   # יכולים להיות רק unfilled/role/special
        gaps = [v for v in viols if v["type"] in ("unfilled", "role", "special")]
        if not gaps:
            return _result_from_assign(problem, forced["assignments"])  # מלא, חוקי, מאוזן
        # נשארו חורים/חוסר תפקיד תחת בטיחות קשיחה ⇒ דיווח + שיבוץ חלקי חוקי + 'מלא הכל'
        holes = [{"slot": v["slot"], "missionId": v["slot"].rsplit("__", 1)[0],
                  "have": v.get("have", 0), "need": v.get("need", 0), "cause": "manpower"}
                 for v in viols if v["type"] == "unfilled"]
        role_r = [{"type": "missing_role", "slot": v["slot"], "role": v["role"]}
                  for v in viols if v["type"] == "role"]
        return {"feasible": False, "reasons": role_r + [{"type": "holes", "holes": holes}],
                "summary": _diagnose_summary(problem, holes),
                "partial": dict(forced["assignments"])}

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

    _add_daily_limits(model, soldiers, slots, x)

    model.Maximize(sum(x.values()))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5.0
    status = solver.Solve(model)

    holes = []
    partial = defaultdict(list)
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for sl in slots:
            chosen = [sid for sid in sl["eligible"] if solver.Value(x[(sl["key"], sid)]) == 1]
            partial[sl["key"]] = chosen
            if len(chosen) < sl["needed"]:
                # סיווג סיבת החוסר לכל משמרת
                if len(sl["eligible"]) == 0:
                    cause = "no_eligible"          # אין חייל נוכח/מוסמך כלל
                elif len(sl["eligible"]) < sl["needed"]:
                    cause = "too_few_eligible"     # פחות מועמדים זכאים מהנדרש
                else:
                    cause = "manpower"             # יש מועמדים אך נוצלו במקום אחר (מנוחה/מכסה)
                holes.append({"slot": sl["key"], "missionId": sl["missionId"],
                              "have": len(chosen), "need": sl["needed"], "cause": cause})

    summary = _diagnose_summary(problem, holes)
    return {"feasible": False, "reasons": [{"type": "holes", "holes": holes}],
            "summary": summary, "partial": dict(partial)}


def _date_from_k(k):
    """חלון k → תאריך היממה הצבאית (ISO)."""
    base = date(2000, 1, 1) + timedelta(days=int(k))
    return base.isoformat()


def _diagnose_summary(problem, holes):
    """ניתוח צווארי בקבוק: לפי יממה (כוח אדם) ולפי תפקיד חובה."""
    soldiers = problem["soldiers"]
    slots = problem["slots"]
    role_of = {s["id"]: s["role"] for s in soldiers}

    demand = sum(sl["dur"] * sl["needed"] for sl in slots)

    # כל חלונות היממה שהמשמרות נוגעות בהם
    windows = set()
    for sl in slots:
        windows.add((sl["startAbs"] - 600) // 1440)
        windows.add((sl["endAbs"] - 1 - 600) // 1440)

    # ── צוואר בקבוק לפי יממה: ביקוש שעות מול קיבולת חיילים×8ש' ──
    day_bottlenecks = []
    for k in windows:
        ws = 600 + k * 1440
        dem = 0
        present = set()
        for sl in slots:
            ov = min(sl["endAbs"], ws + 1440) - max(sl["startAbs"], ws)
            if ov > 0:
                dem += ov * sl["needed"]
                present.update(sl["eligible"])
        cap = len(present) * MAX_DAILY
        if dem > cap:
            day_bottlenecks.append({
                "date": _date_from_k(k),
                "demand_hours": round(dem / 60, 1),
                "capacity_hours": round(cap / 60, 1),
                "soldiers": len(present),
            })

    # ── צוואר בקבוק לפי תפקיד חובה: משמרות הדורשות תפקיד מול בעלי התפקיד ──
    role_shortages = []
    mand_roles = set(r for sl in slots for r in sl.get("mandatory", []))
    for r in mand_roles:
        for k in windows:
            ws = 600 + k * 1440
            need_shifts = 0
            avail = set()
            for sl in slots:
                if r not in sl.get("mandatory", []):
                    continue
                ov = min(sl["endAbs"], ws + 1440) - max(sl["startAbs"], ws)
                if ov > 0:
                    need_shifts += 1
                    avail.update(sid for sid in sl["eligible"] if role_of.get(sid) == r)
            if need_shifts > len(avail):
                role_shortages.append({
                    "role": r, "date": _date_from_k(k),
                    "need": need_shifts, "have": len(avail),
                })

    return {
        "demand_hours": round(demand / 60, 1),
        "present_soldiers": len(set(sid for sl in slots for sid in sl["eligible"])),
        "unfilled_shifts": len(holes),
        "day_bottlenecks": day_bottlenecks,
        "role_shortages": role_shortages,
    }


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
