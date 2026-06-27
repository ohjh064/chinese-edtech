-- 자가 회원가입 기본 역할을 '교사'로 변경 (증분 적용). schema.sql에도 반영됨.
-- 학생은 교사가 일괄 발급(admin)하며, 그 경우 user_metadata.role='student'로 생성된다.

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'teacher')
  )
  on conflict (id) do nothing;
  return new;
end $$;
