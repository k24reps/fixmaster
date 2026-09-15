-- ============================================================
-- FixMaster — 0068: hapus transaksi keuangan atomik + isi bagian klaim lama
--
-- A. Menghapus transaksi di Keuangan ditulis klien langkah demi langkah
--    (wallet → pemasukan/pengeluaran → tiket servis). Gagal di tengah
--    meninggalkan saldo, baris, dan tiket yang tidak saling cocok.
--    delete_finance_entry melakukan semuanya dalam satu transaksi, dengan
--    aturan yang sama seperti klien (owner/admin saja):
--      - pelunasan dihapus → SEMUA kaki pelunasan + koreksinya dibalik, tiket
--        kembali Selesai;
--      - DP dihapus → DP tiket berkurang;
--      - selisih koreksi (pemasukan) dihapus → biaya final turun lagi;
--      - refund koreksi (pengeluaran) dihapus → biaya final naik lagi.
--
-- B. Klaim garansi sebelum 0065 tidak menyimpan bagian yang diklaim. Diisi dari
--    garansi tiket asli yang masih berlaku pada tanggal klaim dibuat, ditandai
--    `inferred` supaya tampil sebagai perkiraan, bukan catatan asli.
-- ============================================================

create or replace function fmt_rp(p_amount numeric)
returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select 'Rp ' || replace(to_char(round(coalesce(p_amount, 0)), 'FM999,999,999,999,990'), ',', '.');
$$;

create or replace function delete_finance_entry(
  p_org_id uuid,
  p_kind text,
  p_id uuid
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_inc incomes%rowtype;
  v_exp expenses%rowtype;
  v_svc services%rowtype;
  v_has_svc boolean := false;
  v_is_dp boolean := false;
  v_is_settle boolean := false;
  v_is_correction boolean := false;
  v_revert boolean := false;
  v_corr_desc text := '';
  v_next_dp numeric;
  v_next_final numeric;
  v_note text;
  v_no text;
  v_now text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;

  if p_kind = 'income' then
    select * into v_inc from incomes where id = p_id and org_id = p_org_id for update;
    if not found then raise exception 'Transaksi tidak ditemukan'; end if;

    if v_inc.category = 'Servis' and v_inc.service_id is not null then
      select * into v_svc from services
        where id = v_inc.service_id and org_id = p_org_id
        for update;
      v_has_svc := found;
    end if;
    if v_has_svc then
      v_is_dp := v_inc.description = 'DP servis ' || v_svc.service_no;
      v_is_settle := v_inc.description = 'Pelunasan servis ' || v_svc.service_no;
      v_corr_desc := 'Koreksi biaya servis ' || v_svc.service_no;
      v_is_correction := v_inc.description = v_corr_desc;
      v_revert := v_svc.status = 'lunas' and not v_is_dp and not v_is_correction;
    end if;

    -- Baris yang dibalik: baris ini, kaki pelunasan lainnya, dan — bila
    -- pelunasan dibatalkan — selisih koreksinya (pelunasan ulang sudah menagih
    -- biaya final hasil koreksi, jadi selisih itu tak boleh tercatat dua kali).
    with removed as (
      delete from incomes i
      where i.org_id = p_org_id
        and (i.id = p_id
             or (v_is_settle and i.service_id = v_inc.service_id and i.description = v_inc.description)
             or (v_revert and i.service_id = v_inc.service_id and i.description = v_corr_desc))
      returning i.wallet_id, i.amount
    )
    update wallets w
      set balance = w.balance - r.total, updated_at = now()
      from (select wallet_id, sum(amount) as total from removed group by wallet_id) r
      where w.id = r.wallet_id and w.org_id = p_org_id;

    if v_revert then
      with removed as (
        delete from expenses e
        where e.org_id = p_org_id and e.description = v_corr_desc
        returning e.wallet_id, e.amount
      )
      update wallets w
        set balance = w.balance + r.total, updated_at = now()
        from (select wallet_id, sum(amount) as total from removed group by wallet_id) r
        where w.id = r.wallet_id and w.org_id = p_org_id;
    end if;

    if v_has_svc then
      v_next_dp := case when v_is_dp
        then greatest(0, coalesce(v_svc.down_payment, 0) - v_inc.amount)
        else v_svc.down_payment end;
      v_next_final := case when v_is_correction
        then greatest(0, coalesce(v_svc.final_cost, 0) - v_inc.amount)
        else v_svc.final_cost end;
      if v_revert
         or v_next_dp is distinct from v_svc.down_payment
         or v_next_final is distinct from v_svc.final_cost then
        v_note := case
          when v_revert then 'Pelunasan dibatalkan (pemasukan dihapus)'
          when v_is_correction then 'Koreksi biaya ' || fmt_rp(v_inc.amount)
            || ' dihapus dari keuangan: biaya final ' || fmt_rp(v_svc.final_cost) || ' → ' || fmt_rp(v_next_final)
          else 'DP ' || fmt_rp(v_inc.amount) || ' dihapus dari keuangan'
        end;
        update services
          set status = case when v_revert then 'selesai' else status end,
              down_payment = v_next_dp,
              final_cost = v_next_final,
              history = coalesce(history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                'at', v_now,
                'status', case when v_revert then 'selesai' else 'edit' end,
                'by', '', 'byName', 'Sistem', 'note', v_note, 'internal', not v_revert
              )),
              updated_at = now()
          where id = v_svc.id;
      end if;
    end if;

  elsif p_kind = 'expense' then
    select * into v_exp from expenses where id = p_id and org_id = p_org_id for update;
    if not found then raise exception 'Transaksi tidak ditemukan'; end if;

    delete from expenses where id = p_id;
    update wallets set balance = balance + v_exp.amount, updated_at = now()
      where id = v_exp.wallet_id and org_id = p_org_id;

    -- Refund Koreksi Biaya (biaya diturunkan) → biaya final naik lagi. Pengeluaran
    -- tak punya service_id, jadi tiketnya dicari dari nomor di deskripsi.
    if v_exp.description like 'Koreksi biaya servis %' then
      v_no := substring(v_exp.description from length('Koreksi biaya servis ') + 1);
      select * into v_svc from services
        where org_id = p_org_id and service_no = v_no
        for update;
      if found then
        update services
          set final_cost = coalesce(final_cost, 0) + v_exp.amount,
              history = coalesce(history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                'at', v_now, 'status', 'edit', 'by', '', 'byName', 'Sistem',
                'note', 'Refund koreksi biaya ' || fmt_rp(v_exp.amount) || ' dihapus dari keuangan: biaya final '
                  || fmt_rp(v_svc.final_cost) || ' → ' || fmt_rp(coalesce(v_svc.final_cost, 0) + v_exp.amount),
                'internal', true
              )),
              updated_at = now()
          where id = v_svc.id;
      end if;
    end if;

  else
    raise exception 'Jenis transaksi tidak valid';
  end if;
end;
$$;

grant execute on function delete_finance_entry(uuid, text, uuid) to authenticated;

-- B. Klaim lama: bagian yang (paling mungkin) diklaim = garansi tiket asli yang
--    masih berlaku pada tanggal klaim dibuat.
update services c
  set claimed_items = (
    select coalesce(jsonb_agg(item order by ord), '[]'::jsonb)
    from (
      select 0 as ord,
             jsonb_build_object('kind', 'service', 'name', 'Jasa servis',
                                'until', o.warranty_service_until::date, 'inferred', true) as item
      where o.warranty_service_until::date >= (c.created_at at time zone 'Asia/Jakarta')::date
      union all
      select 1,
             jsonb_build_object('kind', 'part', 'name', p.name, 'until', p.until, 'inferred', true)
      from (
        select sp->>'name' as name,
               case when jsonb_typeof(sp->'warrantyDays') = 'number'
                    then nullif(sp->>'warrantyUntil', '')::date
                    else o.warranty_parts_until::date end as until
        from jsonb_array_elements(
          case when jsonb_typeof(o.spareparts) = 'array' then o.spareparts else '[]'::jsonb end
        ) sp
      ) p
      where p.until >= (c.created_at at time zone 'Asia/Jakarta')::date
    ) items
  )
  from services o
  where c.warranty_claim_of = o.id
    and c.claimed_items is null;
