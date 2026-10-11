// 데모용 예시 랭킹 6개를 Supabase에 넣는 SQL(supabase/seed.sql)을 만든다.
import { writeFileSync } from 'node:fs';
import { seedWorldcups } from '../src/lib/api/demoSeed.ts';

const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const lines = [
  '-- (선택) 예시 랭킹 6개를 「초안」으로 넣습니다. schema.sql 실행 후에 실행하세요.',
  '-- 관리 페이지에서 내용을 고친 뒤 「공개」로 바꾸면 홈에 보입니다.',
  '-- 다시 실행해도 이미 있는 랭킹(slug 기준)은 건너뜁니다.',
  '',
];
for (const cup of seedWorldcups()) {
  lines.push(`with w as (
  insert into public.worldcups (slug, title, description, keywords, status, thumbnail_url, featured)
  values (${q('sample-' + cup.slug)}, ${q(cup.title)}, ${q(cup.description)}, ${q(cup.keywords)}, 'draft', ${q(cup.thumbnail_url)}, ${cup.featured})
  on conflict (slug) do nothing
  returning id
)
insert into public.candidates (worldcup_id, name, sub, sort_order)
select w.id, c.name, c.sub, c.ord from w, (values
${cup.candidates.map((c, i) => `  (${q(c.name)}, ${q(c.sub)}, ${i})`).join(',\n')}
) as c(name, sub, ord);
`);
}
lines.push("update public.worldcups w set candidate_count = (select count(*) from public.candidates c where c.worldcup_id = w.id and c.active) where w.slug like 'sample-%';");
writeFileSync(new URL('../supabase/seed.sql', import.meta.url), lines.join('\n') + '\n');
console.log('supabase/seed.sql 작성 완료');
