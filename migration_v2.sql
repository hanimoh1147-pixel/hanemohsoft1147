-- Hani Soft Server: تحديث آمن للنسخة الحالية (لا يعيد إنشاء الجداول)
-- نفّذ هذا الملف مرة واحدة من Supabase > SQL Editor.

alter table public.profiles add column if not exists phone text;
alter table public.orders add column if not exists imei text;
alter table public.orders add column if not exists customer_email text;
alter table public.deposit_requests add column if not exists admin_reply text;
alter table public.deposit_requests add column if not exists transfer_proof_reference text;

-- السماح للعميل بتعديل بياناته العامة فقط، دون الدور أو الصلاحيات أو الرصيد.
grant select on public.profiles to authenticated;
grant update (display_name, username, phone) on public.profiles to authenticated;
drop policy if exists "profile self update display" on public.profiles;
create policy "profile self update display" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- لا تمنح anon صلاحيات على الجداول الخاصة، ولا تستخدم service_role في الواجهة.
