 /* ── אסטרטגיית זוגות: שיבוץ לפי קבוצות זמן — כל חייל נשאר באותה קבוצה בכל הימים ── */
 /* forward-checking מבטיח שמעבר בין סוגי משימות לא ייצור dead-end */
 function runPairedStrategy() {
  function getTimeGroup(slot) {
   if (slot.dur >= 360) return slot.shiftOfDay;
   const sod = slot.shiftOfDay;
   if (sod === 1 || sod === 4) return 1;
   if (sod === 2 || sod === 5) return 2;
   return 3;
  }
  /* ── 1. קבץ סלוטים לפי קבוצת-זמן ויום ── */
  const tgMap = {};
  for (const sl of allSlots) {
   const gn = getTimeGroup(sl);
   if (!tgMap[gn]) tgMap[gn] = {};
   if (!tgMap[gn][sl.dayNum]) tgMap[gn][sl.dayNum] = [];
   tgMap[gn][sl.dayNum].push(sl);
  }
  /* ── 2. בנה מושבים — long (סיור/8ש+) ו-pair (זוג 4ש) ── */
  function buildSeats(daySlots) {
   const seats = [];
   const byM = {};
   for (const sl of daySlots) {
    if (!byM[sl.missionId]) byM[sl.missionId] = [];
    byM[sl.missionId].push(sl);
   }
   for (const mId of Object.keys(byM)) {
    const ms = byM[mId].sort((a, b) => a.startAbs - b.startAbs);
    if (ms[0].dur >= 360) {
     for (let i = 0; i < ms[0].needed; i++)
      seats.push({ type: 'long', slots: [ms[0]], missionId: mId, missionName: ms[0].missionName, hardness: ms[0].hardness });
    } else if (ms.length >= 2) {
     for (let i = 0; i < ms[0].needed; i++)
      seats.push({ type: 'pair', slots: [ms[0], ms[1]], missionId: mId, missionName: ms[0].missionName, hardness: Math.max(ms[0].hardness, ms[1].hardness) });
    }
   }
   return seats;
  }
  function canSeat(soldier, seat) {
   if (seat.type === 'long') {
    return seat.slots[0].assigned.length < seat.slots[0].needed && canAssign(soldier, seat.slots[0]);
   }
   const [a, b] = seat.slots;
   if (a.assigned.length >= a.needed || b.assigned.length >= b.needed) return false;
   if (!canAssign(soldier, a)) return false;
   doAssign(soldier, a, '');
   const ok = canAssign(soldier, b);
   undoAssign(soldier.id, a);
   return ok;
  }
  function doSeat(soldier, seat, tag) {
   for (const sl of seat.slots)
    if (sl.assigned.length < sl.needed)
     doAssign(soldier, sl, buildReason(soldier, sl, tag));
  }
  function undoSeat(soldierId, seat) {
   for (const sl of seat.slots)
    if (sl.assignedIds.has(soldierId))
     undoAssign(soldierId, sl);
  }
  /* forward-check: אחרי שיבוץ ניסיוני, ודא שכל המושבים שנותרו עדיין ניתנים למילוי */
  function forwardCheck(daySeats, usedSeats, usedSoldiers, pool) {
   for (let si = 0; si < daySeats.length; si++) {
    if (usedSeats.has(si)) continue;
    const seat = daySeats[si];
    if (seat.slots.every(sl => sl.assigned.length >= sl.needed)) continue;
    if (!pool.some(s => !usedSoldiers.has(s.id) && canSeat(s, seat))) return false;
   }
   return true;
  }
  /* ── 3. עבד כל קבוצת-זמן: מצומצמת → גמישה ── */
  const groupNums = Object.keys(tgMap).map(Number).sort((a, b) => b - a);
  for (const gn of groupNums) {
   const dayMap = tgMap[gn];
   const days = Object.keys(dayMap).map(Number).sort((a, b) => a - b);
   if (!days.length) continue;
   const seatsPerDay = {};
   for (const d of days) seatsPerDay[d] = buildSeats(dayMap[d]);
   if (!seatsPerDay[days[0]]?.length) continue;
   const prevHist = {};
   const grpSoldiers = [];
   for (let di = 0; di < days.length; di++) {
    const day = days[di];
    const daySeats = seatsPerDay[day];
    if (!daySeats?.length) continue;
    if (di === 0) {
     /* ── יום 1: שיבוץ בסיסי — מושבים קשים קודם ── */
     const order = daySeats.map((_, i) => i)
      .sort((a, b) => daySeats[b].hardness - daySeats[a].hardness);
     const usedIds = new Set();
     for (const si of order) {
      const seat = daySeats[si];
      const pool = present.filter(s => !usedIds.has(s.id) && canSeat(s, seat));
      if (!pool.length) continue;
      const pick = rank(pool, seat.slots[0])[0];
      doSeat(pick, seat, '(tg-d1)');
      usedIds.add(pick.id);
      grpSoldiers.push(pick);
      prevHist[pick.id] = [{ missionId: seat.missionId, type: seat.type }];
     }
    } else {
     /* ── ימים 2+: רוטציה עם מקסימום גיוון + forward-checking ── */
     /* ציון גיוון: כמה שונה מושב יעד מהיסטוריה */
     function vScore(soldierId, seat) {
      const prev = prevHist[soldierId] || [];
      let v = 0;
      for (const p of prev) {
       if (p.type !== seat.type) v += 10;
       if (p.missionId !== seat.missionId) v += 5;
      }
      return v;
     }
     const usedSeats = new Set(), usedSoldiers = new Set();
     const allCands = [...grpSoldiers, ...present.filter(s => !grpSoldiers.some(g => g.id === s.id))];
     /* סדר מושבים: קשים קודם, אחר כך הכי מצומצמים */
     const seatOrder = daySeats.map((s, i) => {
      const c = allCands.filter(sol => canSeat(sol, s)).length;
      return { s, i, cands: c };
     }).sort((a, b) => {
      if (b.s.hardness !== a.s.hardness) return b.s.hardness - a.s.hardness;
      return a.cands - b.cands;
     });
     for (const { s: seat, i: si } of seatOrder) {
      if (usedSeats.has(si)) continue;
      if (seat.slots.every(sl => sl.assigned.length >= sl.needed)) continue;
      /* מועמדים: חיילי קבוצה (ממוינים לפי גיוון) ואז חיצוניים */
      const grpPool = grpSoldiers.filter(s => !usedSoldiers.has(s.id) && canSeat(s, seat))
       .sort((a, b) => {
        const va = vScore(a.id, seat), vb = vScore(b.id, seat);
        if (va !== vb) return vb - va;
        const r = rank([a, b], seat.slots[0]);
        return r[0].id === a.id ? -1 : 1;
       });
      const extPool = present.filter(s =>
       !usedSoldiers.has(s.id) && !grpSoldiers.some(g => g.id === s.id) && canSeat(s, seat));
      const candidates = [...grpPool, ...extPool];
      let assigned = false;
      for (const pick of candidates) {
       const vs = vScore(pick.id, seat);
       doSeat(pick, seat, vs > 0 ? '(tg-rotate)' : '(tg-same)');
       usedSeats.add(si);
       usedSoldiers.add(pick.id);
       if (forwardCheck(daySeats, usedSeats, usedSoldiers, allCands)) {
        if (!prevHist[pick.id]) prevHist[pick.id] = [];
        prevHist[pick.id].push({ missionId: seat.missionId, type: seat.type });
        assigned = true;
        break;
       }
       /* rollback — מועמד זה יוצר dead-end */
       undoSeat(pick.id, seat);
       usedSeats.delete(si);
       usedSoldiers.delete(pick.id);
      }
      if (!assigned && candidates.length) {
       /* fallback: אין אפשרות בטוחה, שבץ את הטוב ביותר */
       const fb = candidates[0];
       const vs = vScore(fb.id, seat);
       doSeat(fb, seat, vs > 0 ? '(tg-rotate)' : '(tg-same)');
       usedSeats.add(si);
       usedSoldiers.add(fb.id);
       if (!prevHist[fb.id]) prevHist[fb.id] = [];
       prevHist[fb.id].push({ missionId: seat.missionId, type: seat.type });
      }
     }
    }
   }
  }
 }