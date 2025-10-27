// worker.js
const CACHE = new Map(); // cache kolom per tabel

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "");
    const method = req.method.toUpperCase();

    // CORS
    if (method === "OPTIONS") return resp(204, null, req);

    // Jalankan SQL mentah (terproteksi)
    if (path === "/sql" && method === "POST") {
      if (!auth(req, env)) return err(401, "Unauthorized", req);
      const { sql, params = [], allow_write = false } = await safeJson(req);
      if (!sql) return err(400, "Missing sql", req);
      const isSelect = /^\s*with|\s*select/i.test(sql);
      if (!isSelect && !allow_write) return err(400, "Non-SELECT blocked (set allow_write=true)", req);
      try {
        const stmt = env.DB.prepare(sql);
        const hasAll = /select/i.test(sql);
        const r = hasAll ? await stmt.bind(...params).all()
                         : await stmt.bind(...params).run();
        return ok({ ok: true, result: r }, req);
      } catch (e) { return err(400, e.message, req); }
    }

    // Rute CRUD dinamis: /api/:table  atau  /api/:table/:id
    const m = path.match(/^\/api\/([A-Za-z0-9_]+)(?:\/(\d+))?$/);
    if (!m) return ok({ ok: true, service: "bisbul-api", hint: help() }, req);

    const table = m[1];
    const pathId = m[2] ? Number(m[2]) : null;
    const q = url.searchParams;
    const body = method === "GET" || method === "DELETE" ? {} : await safeJson(req);
    const id = body?.id ?? (q.get("id") ? Number(q.get("id")) : pathId ?? null);

    try {
      // List / Query (GET /api/:table?search=&page=&page_size=)
      if (method === "GET" && !id) return list(env, req, table, q);

      // Detail (GET /api/:table/:id  atau  GET /api/:table?id=1)
      if (method === "GET" && id)   return detail(env, req, table, id);

      // Create (POST /api/:table)
      if (method === "POST") {
        if (!auth(req, env)) return err(401, "Unauthorized", req);
        return create(env, req, table, body);
      }

      // Update (PUT/PATCH /api/:table  {id,...}  atau /api/:table/:id)
      if (method === "PUT" || method === "PATCH") {
        if (!auth(req, env)) return err(401, "Unauthorized", req);
        if (!id) return err(400, "Missing id in path or body", req);
        return update(env, req, table, id, body);
      }

      // Delete (DELETE /api/:table  {id}  atau /api/:table/:id)
      if (method === "DELETE") {
        if (!auth(req, env)) return err(401, "Unauthorized", req);
        if (!id) return err(400, "Missing id in path or query/body", req);
        return remove(env, req, table, id);
      }

      return err(405, "Method not allowed", req);
    } catch (e) {
      return err(400, e.message, req);
    }
  }
};

/* ===== Core CRUD (dinamis) ===== */
async function list(env, req, table, q) {
  await ensureTable(env, table);
  const page = Math.max(1, Number(q.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(q.get("page_size") || 10)));
  const offset = (page - 1) * pageSize;
  const search = (q.get("search") || "").trim();

  const cols = await columns(env, table);
  // KOREKSI DINAMIS: Mencari di SEMUA kolom yang ada di tabel, KECUALI 'id' (Primary Key).
  // Ini memastikan tabel baru pun otomatis memiliki fitur pencarian.
  const likeCols = cols.filter(c => c !== 'id');
  
  const where = [];
  const bind = [];
  
  if (search && likeCols.length) {
    const ors = likeCols.map(c => `${escapeId(c)} LIKE ?`).join(" OR ");
    where.push(`(${ors})`);
    likeCols.forEach(() => bind.push(`%${search}%`));
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const sqlData  = `SELECT * FROM ${escapeId(table)} ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`;
  const sqlCount = `SELECT COUNT(*) as total FROM ${escapeId(table)} ${whereSql}`;

  const [data, cnt] = await Promise.all([
    env.DB.prepare(sqlData).bind(...bind, pageSize, offset).all(),
    env.DB.prepare(sqlCount).bind(...bind).first()
  ]);

  return ok({
    ok: true,
    page, page_size: pageSize,
    total: Number(cnt?.total || 0),
    items: data.results || []
  }, req);
}
async function detail(env, req, table, id) {
  await ensureTable(env, table);
  const row = await env.DB.prepare(
    `SELECT * FROM ${escapeId(table)} WHERE id = ?`
  ).bind(id).first();
  if (!row) return err(404, "Not found", req);
  return ok({ ok: true, data: row }, req);
}

async function create(env, req, table, body) {
  await ensureTable(env, table);
  const cols = await columns(env, table);
  const payload = filterBody(body, cols, /*exclude*/["id"]);
  if (!Object.keys(payload).length) return err(400, "No valid fields", req);

  const keys = Object.keys(payload);
  const placeholders = keys.map(() => "?").join(",");
  const sql = `INSERT INTO ${escapeId(table)} (${keys.map(escapeId).join(",")}) VALUES (${placeholders})`;
  const res = await env.DB.prepare(sql).bind(...keys.map(k => payload[k])).run();
  return ok({ ok: true, id: res.lastRowId }, req, 201);
}

async function update(env, req, table, id, body) {
  await ensureTable(env, table);
  const cols = await columns(env, table);
  const payload = filterBody(body, cols, /*exclude*/["id"]);
  if (!Object.keys(payload).length) return err(400, "No valid fields", req);

  const set = Object.keys(payload).map(k => `${escapeId(k)} = ?`).join(", ");
  const sql = `UPDATE ${escapeId(table)} SET ${set} WHERE id = ?`;
  const res = await env.DB.prepare(sql).bind(...Object.keys(payload).map(k => payload[k]), id).run();
  if (res.meta.changes === 0) return err(404, "Not found", req);
  return ok({ ok: true, updated: res.meta.changes }, req);
}

async function remove(env, req, table, id) {
  await ensureTable(env, table);
  const sql = `DELETE FROM ${escapeId(table)} WHERE id = ?`;
  const res = await env.DB.prepare(sql).bind(id).run();
  if (res.meta.changes === 0) return err(404, "Not found", req);
  return ok({ ok: true, deleted: res.meta.changes }, req);
}

/* ===== Helpers ===== */
function auth(req, env) {
  const key = req.headers.get("X-API-Key") || (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  return env.API_KEY ? key === env.API_KEY : true;
}
function escapeId(id) {
  // escape identifier sederhana untuk nama kolom/tabel
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) throw new Error("Invalid identifier");
  return `"${id}"`;
}
async function ensureTable(env, table) {
  // validasi cepat: tabel harus eksis
  const r = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
  ).bind(table).first();
  if (!r) throw new Error(`Table not found: ${table}`);
}
async function columns(env, table) {
  const k = `columns:${table}`;
  if (CACHE.has(k)) return CACHE.get(k);
  const r = await env.DB.prepare(`PRAGMA table_info(${escapeId(table)})`).all();
  const cols = (r.results || []).map(x => x.name);
  CACHE.set(k, cols);
  return cols;
}
function filterBody(obj, cols, exclude = []) {
  const set = new Set(cols.filter(c => !exclude.includes(c)));
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (set.has(k)) out[k] = v;
  }
  return out;
}
async function safeJson(req) {
  const ct = req.headers.get("Content-Type") || "";
  if (ct.includes("application/json")) return await req.json();
  if (ct.includes("application/x-www-form-urlencoded")) {
    const fd = await req.formData();
    const o = {}; for (const [k, v] of fd.entries()) o[k] = v; return o;
  }
  return {};
}
function cors(req) {
  const origin = req.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-API-Key",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json; charset=utf-8"
  };
}
function resp(status, data, req) {
  return new Response(data ? JSON.stringify(data) : null, { status, headers: cors(req) });
}
function ok(data, req, status = 200) { return resp(status, data, req); }
function err(status, message, req) { return resp(status, { ok: false, error: message }, req); }
function help() {
  return {
    sql: "POST /sql { sql, params?, allow_write? }  (API key)",
    list: "GET /api/:table?search=&page=&page_size=",
    detail: "GET /api/:table/:id  or  GET /api/:table?id=",
    create: "POST /api/:table  { ...fields }  (API key)",
    update: "PUT|PATCH /api/:table/:id  { ...fields }  (API key)",
    delete: "DELETE /api/:table/:id  (API key)",
    id_from_json: "Semua operasi boleh kirim {id} di body JSON"
  };
}
