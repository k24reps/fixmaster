-- ============================================================
-- FixMaster — task_instances.template_id boleh NULL (tugas cepat / ad-hoc)
-- "Tugas cepat hari ini" tidak punya template induk. Sebelumnya UI menulis
-- template_id = '' (string kosong) yang VALID di IndexedDB lokal tapi
-- memicu `invalid input syntax for type uuid` di Postgres cloud → tugas
-- cepat gagal ditambahkan di produksi. UI kini mengirim NULL; kolomnya
-- harus mengizinkan NULL agar ad-hoc task bisa disimpan.
-- Idempotent: drop not null aman dijalankan berulang.
-- ============================================================

alter table task_instances alter column template_id drop not null;
