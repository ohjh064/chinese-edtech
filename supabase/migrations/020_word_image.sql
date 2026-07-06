-- 단어 대표 이미지: 교사가 붙인 이미지 URL(업로드 or 온라인 검색). 학생 1단계(듣기)에서 노출.
-- 이미지는 정답키가 아니고 학생에게 보여야 하므로 words 테이블에 둔다(word_keys 아님).
alter table words add column if not exists image_url text;

-- PC 업로드용 공개 스토리지 버킷(공개 읽기 → <img src=publicUrl>). 업로드는 서비스롤 라우트 핸들러가 수행.
insert into storage.buckets (id, name, public)
values ('word-images', 'word-images', true)
on conflict (id) do nothing;
