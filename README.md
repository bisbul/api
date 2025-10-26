 

 

## 🚀 Fitur Utama

- ⚙️ **CRUD Otomatis** untuk semua tabel (GET, POST, PATCH/PUT, DELETE)
- 🧩 **Nama tabel dinamis**: `/api/:table` → bisa untuk semua tabel di D1
- 🔎 **Query dinamis**: pencarian (`?search=`), paginasi (`?page=`), dan filter dasar
- 🧠 **Eksekusi SQL manual** via endpoint `/sql`
- 🔐 **Proteksi API Key** untuk operasi tulis & query raw
- 🔁 **Output JSON standar** (mudah dipakai di dashboard, mobile, SPA, dll.)
- 🌐 **CORS enabled** — bisa diakses dari domain atau front-end mana pun
- 🪶 Tanpa dependensi eksternal — 100% native Cloudflare Worker

---

## 📁 Struktur Proyek

```

api-bisbul/
├── wrangler.toml       # konfigurasi worker + D1 binding
├── worker.js           # kode utama API dinamis
└── schema.sql          # contoh skema database

````

---

## ⚙️ Persiapan Lingkungan

### 1️⃣ Instal Wrangler CLI
```bash
npm install -g wrangler
````

### 2️⃣ Buat Database D1

```bash
wrangler d1 create bisbul_db
```

> Catat `database_id` yang dihasilkan.

### 3️⃣ Edit `wrangler.toml`

```toml
name = "bisbul-api"
main = "worker.js"
compatibility_date = "2025-10-26"

[[d1_databases]]
binding = "DB"
database_name = "bisbul_db"
database_id = "YOUR_D1_DB_UUID"

[vars]
API_KEY = "change-this-strong-secret"
```

### 4️⃣ (Opsional) Buat tabel awal

```sql
-- schema.sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'member',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

Lalu jalankan:

```bash
wrangler d1 execute bisbul_db --file=./schema.sql
```

---

## 🚦 Jalankan API Secara Lokal

```bash
wrangler dev
```

Akses di:

```
http://localhost:8787
```

---

## 🌐 Deploy ke Cloudflare

```bash
wrangler deploy
```

Jika sudah punya domain di Cloudflare (misal `api.bisbul.com`),
tambahkan route di `wrangler.toml`:

```toml
routes = [
  { pattern = "api.bisbul.com/*", zone_name = "bisbul.com" }
]
```

---

## 🧩 Cara Penggunaan API

### 1️⃣ List data

```bash
GET https://api.bisbul.com/api/users?page=1&page_size=10&search=wawan
```

### 2️⃣ Detail data

```bash
GET https://api.bisbul.com/api/users/1
GET https://api.bisbul.com/api/users?id=1
```

### 3️⃣ Tambah data (POST)

```bash
curl -X POST https://api.bisbul.com/api/users \
  -H "Content-Type: application/json" \
  -H "X-API-Key: change-this-strong-secret" \
  -d '{"name":"Budi","email":"budi@bisbul.com","role":"student"}'
```

### 4️⃣ Ubah data (PATCH / PUT)

```bash
curl -X PATCH https://api.bisbul.com/api/users \
  -H "Content-Type: application/json" \
  -H "X-API-Key: change-this-strong-secret" \
  -d '{"id":1,"role":"admin","is_active":1}'
```

### 5️⃣ Hapus data (DELETE)

```bash
curl -X DELETE https://api.bisbul.com/api/users/1 \
  -H "X-API-Key: change-this-strong-secret"
```

---

## 🧮 Endpoint SQL Langsung (Opsional)

### 🔍 Query aman (default SELECT only)

```bash
curl -X POST https://api.bisbul.com/sql \
  -H "Content-Type: application/json" \
  -H "X-API-Key: change-this-strong-secret" \
  -d '{"sql":"SELECT id,name,email FROM users WHERE email LIKE ?","params":["%bisbul.com%"]}'
```

### ✏️ Query tulis (INSERT/UPDATE/DELETE)

```bash
curl -X POST https://api.bisbul.com/sql \
  -H "Content-Type: application/json" \
  -H "X-API-Key: change-this-strong-secret" \
  -d '{"sql":"DELETE FROM users WHERE id=?","params":[1],"allow_write":true}'
```

---

## 🧠 Konsep API Dinamis

Semua tabel dapat diakses melalui pola rute:

| Operasi      | HTTP Method | Endpoint Contoh  | Catatan                                       |
| ------------ | ----------- | ---------------- | --------------------------------------------- |
| List         | GET         | `/api/users`     | mendukung `?search=&page=&page_size=`         |
| Detail       | GET         | `/api/users/1`   | juga mendukung `?id=`                         |
| Tambah       | POST        | `/api/users`     | body JSON `{field:value}`                     |
| Ubah         | PATCH / PUT | `/api/users/:id` | body JSON `{id, ...fields}`                   |
| Hapus        | DELETE      | `/api/users/:id` | butuh API Key                                 |
| SQL Langsung | POST        | `/sql`           | dengan parameter `{sql, params, allow_write}` |

---

## 🔐 Keamanan

| Lapisan               | Fungsi                                                                        |
| --------------------- | ----------------------------------------------------------------------------- |
| `API_KEY`             | wajib untuk operasi POST, PUT/PATCH, DELETE, dan `/sql`                       |
| Validasi tabel        | nama tabel & kolom diverifikasi (`PRAGMA table_info`) untuk cegah injeksi SQL |
| `escapeId()`          | membersihkan nama tabel/kolom dari karakter ilegal                            |
| CORS                  | mengizinkan semua origin (`*`), bisa dibatasi bila perlu                      |
| Rate limit (opsional) | bisa ditambahkan dengan Workers KV/Analytics                                  |

---

## 📦 Integrasi Cepat

### Contoh Fetch di JavaScript

```js
async function getUsers() {
  const res = await fetch("https://api.bisbul.com/api/users");
  const data = await res.json();
  console.log(data.items);
}
```

### Contoh di PHP (cURL)

```php
$json = file_get_contents("https://api.bisbul.com/api/users/1");
$user = json_decode($json, true);
echo $user["data"]["name"];
```

---

## 🧰 Tools & Teknologi

| Komponen               | Deskripsi                                               |
| ---------------------- | ------------------------------------------------------- |
| **Cloudflare Workers** | Serverless runtime yang cepat dan global                |
| **D1 Database**        | Database SQLite bawaan Cloudflare                       |
| **Wrangler CLI**       | Alat untuk build & deploy Workers                       |
| **JSON API**           | Format output universal untuk integrasi lintas platform |

---

## 🧾 Lisensi

MIT License © 2025 [Wawan Sismadi](https://github.com/sismadi)

---

## 💡 Catatan Akhir

> API ini dirancang sebagai **komponen backend generik**
> untuk arsitektur **Hybrid MVCS (Model-View-Controller-Service)**
> yang digunakan dalam berbagai modul seperti:
>
> * Presensi berbasis Face Recognition
> * Ujian Online dengan Deteksi Kecurangan
> * Micro-Credential & Open Badge
>
> Tujuannya: mempercepat eksperimen akademik dan pengembangan sistem modular LMS.

---

### 🧷 Referensi

* [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
* [Cloudflare Workers API Reference](https://developers.cloudflare.com/workers/runtime-apis/)
* [Wrangler CLI Guide](https://developers.cloudflare.com/workers/wrangler/)

```

---

Apakah Anda ingin saya tambahkan **badge GitHub (deploy, MIT license, versi wrangler)** dan **contoh OpenAPI.yaml (untuk dokumentasi Swagger/Postman)?**  
Itu bisa saya buatkan agar repositori Anda tampak lebih profesional di GitHub dan mudah diakses mahasiswa.
```
