import { supabase } from './supabaseClient.js';

// ============================================================
// RETRY HELPER — retries a Supabase call up to N times with delay
// ============================================================
async function withRetry(fn, retries = 3, delayMs = 800) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await fn();
      return result;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
}

// ============================================================
// USERS - sync between app format and Supabase
// ============================================================

export async function syncUsersToDb(users) {
  try {
    const rows = users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      password_hash: u.passwordHash || null,
      phone: u.phone || '',
      bio: u.bio || '',
      blocked: !!u.blocked,
      linked_soldier_id: u.soldierId || null,
      invite_registered: !!u.inviteRegistered,
      created_by: u.createdBy || null,
      created_at: u.createdAt || new Date().toISOString()
    }));
    const { error } = await supabase.from('users').upsert(rows, { onConflict: 'id' });
    if (error) console.error('[Supabase] syncUsers error:', error.message);

    // Remove users that no longer exist in the app
    const ids = users.map(u => u.id);
    if (ids.length > 0) {
      await supabase.from('users').delete().not('id', 'in', `(${ids.join(',')})`);
    }
  } catch (e) {
    console.error('[Supabase] syncUsers exception:', e.message);
  }
}

export async function loadUsersFromDb() {
  try {
    const { data, error } = await supabase.from('users').select('*');
    if (error) { console.error('[Supabase] loadUsers error:', error.message); return null; }
    if (!data || data.length === 0) return null;
    return data.map(r => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      passwordHash: r.password_hash,
      phone: r.phone || '',
      bio: r.bio || '',
      blocked: r.blocked || false,
      soldierId: r.linked_soldier_id || null,
      inviteRegistered: r.invite_registered || false,
      createdBy: r.created_by || undefined,
      createdAt: r.created_at
    }));
  } catch (e) {
    console.error('[Supabase] loadUsers exception:', e.message);
    return null;
  }
}

// ============================================================
// DEPLOYMENTS - sync between app format and Supabase
// ============================================================

export async function syncDeploymentsToDb(deployments) {
  try {
    for (const dep of deployments) {
      // 1. Upsert deployment record
      const { error: depErr } = await supabase.from('deployments').upsert({ id: dep.id, name: dep.name });
      if (depErr) { console.error('[Supabase] upsert deployment error:', depErr.message); continue; }

      // 2. Sync soldiers
      await syncSoldiersForDep(dep);

      // 3. Sync missions
      await syncMissionsForDep(dep);

      // 4. Sync attendance
      await syncAttendanceForDep(dep);

      // 5. Sync assignments
      await syncAssignmentsForDep(dep);
    }

    // Remove deployments that no longer exist
    const depIds = deployments.map(d => d.id);
    if (depIds.length > 0) {
      await supabase.from('deployments').delete().not('id', 'in', `(${depIds.join(',')})`);
    }
  } catch (e) {
    console.error('[Supabase] syncDeployments exception:', e.message);
  }
}

async function syncSoldiersForDep(dep) {
  const soldiers = dep.soldiers || [];
  if (soldiers.length > 0) {
    const rows = soldiers.map(s => ({
      id: s.id,
      deployment_id: dep.id,
      name: s.name,
      role: s.role || 'חייל',
      phone: s.phone || '',
      notes: s.notes || '',
      certifications: s.certifications || []
    }));
    const { error } = await supabase.from('soldiers').upsert(rows, { onConflict: 'id' });
    if (error) console.error('[Supabase] upsert soldiers error:', error.message);
  }

  // Delete soldiers removed from this deployment
  const ids = soldiers.map(s => s.id);
  const deleteQuery = supabase.from('soldiers').delete().eq('deployment_id', dep.id);
  if (ids.length > 0) {
    await deleteQuery.not('id', 'in', `(${ids.join(',')})`);
  } else {
    await deleteQuery;
  }
}

async function syncMissionsForDep(dep) {
  const missions = dep.missions || [];
  if (missions.length > 0) {
    const rows = missions.map(m => ({
      id: m.id,
      deployment_id: dep.id,
      name: m.name,
      location: m.location || '',
      priority: m.priority || 'normal',
      start_date: m.startDate || null,
      start_time: m.startTime || '06:00',
      end_date: m.endDate || null,
      end_time: m.endTime || '06:00',
      num_shifts: m.numShifts || 1,
      soldiers_per_shift: m.soldiersPerShift || 2,
      min_special_roles: m.minSpecialRoles || 0,
      mandatory_roles: m.mandatoryRoles || [],
      required_certs: m.requiredCerts || [],
      count_mission: m.countMission !== false,
      shifts: m.shifts || []
    }));
    const { error } = await supabase.from('missions').upsert(rows, { onConflict: 'id' });
    if (error) console.error('[Supabase] upsert missions error:', error.message);
  }

  const ids = missions.map(m => m.id);
  const deleteQuery = supabase.from('missions').delete().eq('deployment_id', dep.id);
  if (ids.length > 0) {
    await deleteQuery.not('id', 'in', `(${ids.join(',')})`);
  } else {
    await deleteQuery;
  }
}

async function syncAttendanceForDep(dep) {
  const attendance = dep.attendance || {};
  const rows = [];
  for (const [date, soldiers] of Object.entries(attendance)) {
    for (const [soldierId, record] of Object.entries(soldiers)) {
      rows.push({
        deployment_id: dep.id,
        date,
        soldier_id: soldierId,
        status: record.status || 'unknown',
        start_time: record.from || '10:00',
        end_time: record.to || '10:00',
        note: record.note || ''
      });
    }
  }

  // Delete all attendance for this deployment, then insert fresh
  await supabase.from('attendance').delete().eq('deployment_id', dep.id);
  if (rows.length > 0) {
    // Insert in batches of 500
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await supabase.from('attendance').insert(batch);
      if (error) console.error('[Supabase] insert attendance error:', error.message);
    }
  }
}

async function syncAssignmentsForDep(dep) {
  const assignments = dep.assignments || [];

  await supabase.from('assignments').delete().eq('deployment_id', dep.id);
  if (assignments.length > 0) {
    const rows = assignments.map(a => ({
      deployment_id: dep.id,
      date: a.date,
      data: a.data || [],
      created_at: a.createdAt || new Date().toISOString()
    }));
    const { error } = await supabase.from('assignments').insert(rows);
    if (error) console.error('[Supabase] insert assignments error:', error.message);
  }
}

// ============================================================
// LOAD - fetch all deployments from Supabase and reconstruct
// ============================================================

export async function loadDeploymentsFromDb() {
  try {
    const { data: deps, error: depErr } = await supabase.from('deployments').select('*');
    if (depErr) { console.error('[Supabase] loadDeployments error:', depErr.message); return null; }
    if (!deps || deps.length === 0) return null;

    const result = [];
    for (const dep of deps) {
      // Fetch soldiers
      const { data: soldiers } = await supabase
        .from('soldiers').select('*').eq('deployment_id', dep.id);

      // Fetch missions
      const { data: missions } = await supabase
        .from('missions').select('*').eq('deployment_id', dep.id);

      // Fetch attendance
      const { data: attRows } = await supabase
        .from('attendance').select('*').eq('deployment_id', dep.id);

      // Fetch assignments
      const { data: assignRows } = await supabase
        .from('assignments').select('*').eq('deployment_id', dep.id);

      // Reconstruct attendance map: { date: { soldierId: record } }
      const attendance = {};
      for (const r of (attRows || [])) {
        if (!attendance[r.date]) attendance[r.date] = {};
        attendance[r.date][r.soldier_id] = {
          status: r.status,
          note: r.note || '',
          from: r.start_time || '10:00',
          to: r.end_time || '10:00'
        };
      }

      // Reconstruct assignments array
      const assignments = (assignRows || []).map(a => ({
        date: a.date,
        data: a.data || [],
        createdAt: a.created_at
      }));

      // Reconstruct soldiers
      const soldiersArr = (soldiers || []).map(s => ({
        id: s.id,
        name: s.name,
        role: s.role || 'חייל',
        phone: s.phone || '',
        notes: s.notes || '',
        certifications: s.certifications || []
      }));

      // Reconstruct missions
      const missionsArr = (missions || []).map(m => ({
        id: m.id,
        name: m.name,
        location: m.location || '',
        priority: m.priority || 'normal',
        startDate: m.start_date,
        startTime: m.start_time || '06:00',
        endDate: m.end_date,
        endTime: m.end_time || '06:00',
        numShifts: m.num_shifts || 1,
        soldiersPerShift: m.soldiers_per_shift || 2,
        minSpecialRoles: m.min_special_roles || 0,
        mandatoryRoles: m.mandatory_roles || [],
        requiredCerts: m.required_certs || [],
        countMission: m.count_mission !== false,
        shifts: m.shifts || []
      }));

      result.push({
        id: dep.id,
        name: dep.name,
        soldiers: soldiersArr,
        missions: missionsArr,
        attendance,
        assignments
      });
    }
    return result;
  } catch (e) {
    console.error('[Supabase] loadDeployments exception:', e.message);
    return null;
  }
}
