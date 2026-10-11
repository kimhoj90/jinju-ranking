// 데모 모드에서 처음 보여줄 예시 랭킹. 기존 사이트의 예시 콘텐츠를 그대로 옮겼다.
import type { Candidate, Worldcup } from '../types';

type SeedCup = Omit<Worldcup, 'candidates'> & { candidates: Candidate[] };

function cup(
  id: string,
  title: string,
  description: string,
  image: string,
  keywords: string,
  createdAt: string,
  names: string[],
  featured = false,
): SeedCup {
  return {
    id,
    slug: id,
    title,
    description,
    keywords,
    status: 'published',
    candidate_count: names.length,
    thumbnail_url: `/images/${image}.webp`,
    featured,
    sort_order: 0,
    created_at: createdAt,
    published_at: createdAt,
    candidates: names.map((line, i) => {
      const [name, sub = ''] = line.split('|');
      return { id: `${id}-${i + 1}`, name, sub, image_url: '', sort_order: i, active: true };
    }),
  };
}

export function seedWorldcups(): SeedCup[] {
  return [
    cup(
      'food',
      '진주에서 딱 한 끼만 먹는다면?',
      '냉면부터 비빔밥까지, 오늘의 한 끼를 골라주세요.',
      'food',
      '진주맛집, 냉면, 비빔밥, 점심, 저녁',
      '2026-10-10T09:00:00+09:00',
      [
        '진주냉면|시원한 육수에 육전 한 점',
        '진주비빔밥|색색의 나물을 한 그릇에',
        '육전|고소하게 부친 든든한 한 점',
        '장어구이|노릇노릇 구워낸 한 상',
        '소고기국밥|뜨끈한 국물 한 숟갈',
        '돼지국밥|속까지 든든해지는 맛',
        '칼국수|후루룩, 정겨운 한 그릇',
        '수제비|비 오는 날 생각나는 맛',
        '불고기|달큰한 양념과 따끈한 밥',
        '삼겹살|지글지글, 함께 먹는 즐거움',
        '김밥|소풍길의 작은 행복',
        '비빔국수|매콤새콤한 한 젓가락',
        '돌솥밥|마지막 누룽지까지',
        '된장찌개|오래도록 익숙한 집밥',
        '팥죽|따뜻하고 포근한 한 그릇',
        '만두|한 입 가득 담긴 맛',
      ],
      true,
    ),
    cup(
      'night',
      '진주의 밤, 어디가 가장 좋을까?',
      '해가 지면 더 좋아지는 진주의 풍경.',
      'night',
      '야경, 남강, 유등, 데이트',
      '2026-10-09T09:00:00+09:00',
      ['촉석루 야경', '남강 유등', '진주교', '천수교', '금산교', '남강변 산책로', '망진산 전망', '진양호 노을'],
    ),
    cup(
      'cafe',
      '내가 좋아하는 카페의 한 장면',
      '커피 한 잔보다 오래 남는 분위기는?',
      'coffee',
      '카페, 커피, 분위기',
      '2026-10-08T09:00:00+09:00',
      ['남강이 보이는 창가', '조용한 책 읽는 자리', '햇살 가득 테라스', '골목 속 작은 카페', '넓은 정원 카페', '빈티지한 공간', '탁 트인 루프탑', '따뜻한 한옥 카페'],
    ),
    cup(
      'walk',
      '오늘은 이 길을 걷고 싶어',
      '잠깐 쉬어가고 싶은 날, 나만의 산책 코스.',
      'walk',
      '산책, 공원, 걷기',
      '2026-10-07T09:00:00+09:00',
      ['남강변', '진주성', '진양호 공원', '금호지', '경상국립대 가좌캠퍼스', '월아산 숲속의 진주', '선학산', '망진산'],
    ),
    cup(
      'dessert',
      '밥 배 따로, 디저트 배 따로',
      '마지막 한 입까지 고민되는 달콤한 대결.',
      'dessert',
      '디저트, 빵, 케이크',
      '2026-10-06T09:00:00+09:00',
      ['딸기 케이크', '팥빙수', '소금빵', '크루아상', '약과', '찹쌀떡', '아이스크림', '푸딩'],
    ),
    cup(
      'weekend',
      '진주에서 보내는 완벽한 주말',
      '익숙한 동네에서도 새로운 하루를 만나봐요.',
      'trip',
      '주말, 나들이, 데이트',
      '2026-10-05T09:00:00+09:00',
      ['진주성 나들이', '진양호 피크닉', '남강 자전거 타기', '중앙시장 구경', '국립진주박물관 관람', '월아산 숲 산책', '금호지 산책', '카페에서 책 읽기'],
    ),
  ];
}

/** 같은 결과가 나오도록 씨앗값을 쓰는 난수 */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
