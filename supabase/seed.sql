-- (선택) 예시 랭킹 6개를 「초안」으로 넣습니다. schema.sql 실행 후에 실행하세요.
-- 관리 페이지에서 내용을 고친 뒤 「공개」로 바꾸면 홈에 보입니다.
-- 다시 실행해도 이미 있는 랭킹(slug 기준)은 건너뜁니다.

with w as (
  insert into public.worldcups (slug, title, description, keywords, status, thumbnail_url, featured)
  values ('sample-food', '진주에서 딱 한 끼만 먹는다면?', '냉면부터 비빔밥까지, 오늘의 한 끼를 골라주세요.', '진주맛집, 냉면, 비빔밥, 점심, 저녁', 'draft', '/images/food.webp', true)
  on conflict (slug) do nothing
  returning id
)
insert into public.candidates (worldcup_id, name, sub, sort_order)
select w.id, c.name, c.sub, c.ord from w, (values
  ('진주냉면', '시원한 육수에 육전 한 점', 0),
  ('진주비빔밥', '색색의 나물을 한 그릇에', 1),
  ('육전', '고소하게 부친 든든한 한 점', 2),
  ('장어구이', '노릇노릇 구워낸 한 상', 3),
  ('소고기국밥', '뜨끈한 국물 한 숟갈', 4),
  ('돼지국밥', '속까지 든든해지는 맛', 5),
  ('칼국수', '후루룩, 정겨운 한 그릇', 6),
  ('수제비', '비 오는 날 생각나는 맛', 7),
  ('불고기', '달큰한 양념과 따끈한 밥', 8),
  ('삼겹살', '지글지글, 함께 먹는 즐거움', 9),
  ('김밥', '소풍길의 작은 행복', 10),
  ('비빔국수', '매콤새콤한 한 젓가락', 11),
  ('돌솥밥', '마지막 누룽지까지', 12),
  ('된장찌개', '오래도록 익숙한 집밥', 13),
  ('팥죽', '따뜻하고 포근한 한 그릇', 14),
  ('만두', '한 입 가득 담긴 맛', 15)
) as c(name, sub, ord);

with w as (
  insert into public.worldcups (slug, title, description, keywords, status, thumbnail_url, featured)
  values ('sample-night', '진주의 밤, 어디가 가장 좋을까?', '해가 지면 더 좋아지는 진주의 풍경.', '야경, 남강, 유등, 데이트', 'draft', '/images/night.webp', false)
  on conflict (slug) do nothing
  returning id
)
insert into public.candidates (worldcup_id, name, sub, sort_order)
select w.id, c.name, c.sub, c.ord from w, (values
  ('촉석루 야경', '', 0),
  ('남강 유등', '', 1),
  ('진주교', '', 2),
  ('천수교', '', 3),
  ('금산교', '', 4),
  ('남강변 산책로', '', 5),
  ('망진산 전망', '', 6),
  ('진양호 노을', '', 7)
) as c(name, sub, ord);

with w as (
  insert into public.worldcups (slug, title, description, keywords, status, thumbnail_url, featured)
  values ('sample-cafe', '내가 좋아하는 카페의 한 장면', '커피 한 잔보다 오래 남는 분위기는?', '카페, 커피, 분위기', 'draft', '/images/coffee.webp', false)
  on conflict (slug) do nothing
  returning id
)
insert into public.candidates (worldcup_id, name, sub, sort_order)
select w.id, c.name, c.sub, c.ord from w, (values
  ('남강이 보이는 창가', '', 0),
  ('조용한 책 읽는 자리', '', 1),
  ('햇살 가득 테라스', '', 2),
  ('골목 속 작은 카페', '', 3),
  ('넓은 정원 카페', '', 4),
  ('빈티지한 공간', '', 5),
  ('탁 트인 루프탑', '', 6),
  ('따뜻한 한옥 카페', '', 7)
) as c(name, sub, ord);

with w as (
  insert into public.worldcups (slug, title, description, keywords, status, thumbnail_url, featured)
  values ('sample-walk', '오늘은 이 길을 걷고 싶어', '잠깐 쉬어가고 싶은 날, 나만의 산책 코스.', '산책, 공원, 걷기', 'draft', '/images/walk.webp', false)
  on conflict (slug) do nothing
  returning id
)
insert into public.candidates (worldcup_id, name, sub, sort_order)
select w.id, c.name, c.sub, c.ord from w, (values
  ('남강변', '', 0),
  ('진주성', '', 1),
  ('진양호 공원', '', 2),
  ('금호지', '', 3),
  ('경상국립대 가좌캠퍼스', '', 4),
  ('월아산 숲속의 진주', '', 5),
  ('선학산', '', 6),
  ('망진산', '', 7)
) as c(name, sub, ord);

with w as (
  insert into public.worldcups (slug, title, description, keywords, status, thumbnail_url, featured)
  values ('sample-dessert', '밥 배 따로, 디저트 배 따로', '마지막 한 입까지 고민되는 달콤한 대결.', '디저트, 빵, 케이크', 'draft', '/images/dessert.webp', false)
  on conflict (slug) do nothing
  returning id
)
insert into public.candidates (worldcup_id, name, sub, sort_order)
select w.id, c.name, c.sub, c.ord from w, (values
  ('딸기 케이크', '', 0),
  ('팥빙수', '', 1),
  ('소금빵', '', 2),
  ('크루아상', '', 3),
  ('약과', '', 4),
  ('찹쌀떡', '', 5),
  ('아이스크림', '', 6),
  ('푸딩', '', 7)
) as c(name, sub, ord);

with w as (
  insert into public.worldcups (slug, title, description, keywords, status, thumbnail_url, featured)
  values ('sample-weekend', '진주에서 보내는 완벽한 주말', '익숙한 동네에서도 새로운 하루를 만나봐요.', '주말, 나들이, 데이트', 'draft', '/images/trip.webp', false)
  on conflict (slug) do nothing
  returning id
)
insert into public.candidates (worldcup_id, name, sub, sort_order)
select w.id, c.name, c.sub, c.ord from w, (values
  ('진주성 나들이', '', 0),
  ('진양호 피크닉', '', 1),
  ('남강 자전거 타기', '', 2),
  ('중앙시장 구경', '', 3),
  ('국립진주박물관 관람', '', 4),
  ('월아산 숲 산책', '', 5),
  ('금호지 산책', '', 6),
  ('카페에서 책 읽기', '', 7)
) as c(name, sub, ord);

update public.worldcups w set candidate_count = (select count(*) from public.candidates c where c.worldcup_id = w.id and c.active) where w.slug like 'sample-%';
