-- ============================================================
-- FixMaster — 0041: satu template = nama + BANYAK tugas (items)
--
-- Perubahan model (permintaan user): dulu 1 template = 1 tugas. Kini
-- template punya NAMA (mis. "SOP Buka Toko") dan berisi beberapa item
-- tugas yang urutannya diatur di tab Template.
--
-- items disimpan sebagai JSONB di baris template (BUKAN tabel baru),
-- mengikuti preseden Service.spareparts: tanpa tabel/RLS/koleksi adapter
-- baru. Kunci camelCase di dalam JSONB karena adapter hanya mengonversi
-- snake_case di level kolom, isi JSONB lewat apa adanya.
--
-- BLOKIR YANG DIBUKA: unique (template_id, due_date) hanya mengizinkan
-- SATU instance per template per hari — dengan multi-item, tugas ke-2
-- dst. akan ditolak. Diganti unique (template_id, item_id, due_date).
-- Ini MELONGGARKAN aturan (bukan mengetatkan), jadi tak ada baris lama
-- yang bisa melanggarnya.
--
-- Idempotent + backfill menjaga data lama tetap utuh.
-- ============================================================

-- ---------- task_templates: name + items ----------
alter table task_templates add column if not exists name text;
alter table task_templates add column if not exists items jsonb not null default '[]'::jsonb;

-- Backfill: tiap template lama jadi template ber-nama dengan SATU item.
-- Item id sengaja memakai id template itu sendiri → deterministik, sehingga
-- instance lama di bawah bisa dikaitkan ke item ini tanpa menebak.
update task_templates
set
  name = coalesce(nullif(name, ''), title),
  items = jsonb_build_array(
    jsonb_build_object(
      'id', id::text,
      'title', title,
      'description', coalesce(description, ''),
      'sortOrder', 0
    )
  )
where items = '[]'::jsonb;

-- ---------- task_instances: item_id ----------
alter table task_instances add column if not exists item_id text;

-- Backfill selaras dengan item id di atas (= id template lama).
update task_instances
set item_id = template_id::text
where template_id is not null and item_id is null;

-- ---------- tukar unique constraint ----------
-- Lama: 1 tugas/template/hari. Baru: 1 tugas per ITEM/template/hari.
alter table task_instances drop constraint if exists task_instances_template_id_due_date_key;
create unique index if not exists task_instances_tpl_item_due_key
  on task_instances (template_id, item_id, due_date);
