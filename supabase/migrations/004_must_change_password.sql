-- 첫 로그인 시 임시 비밀번호 강제 변경 플래그 (증분 적용). schema.sql에도 포함.
alter table profiles
  add column if not exists must_change_password boolean not null default false;
