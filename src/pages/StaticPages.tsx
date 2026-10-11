import { ChartColumn, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSite, useUi } from '../context/AppContext';

/** 개인정보처리방침·이용약관 시행일. 공개 전에 실제 날짜로 바꿔주세요. */
const EFFECTIVE_DATE = '2026년 10월 ○○일';

export function Records() {
  return (
    <main className="wrap records-page">
      <span className="eyebrow">JINJU ARCHIVE</span>
      <h1>진주기록</h1>
      <section className="records-empty">
        <div className="record-symbol">
          <ChartColumn size={46} />
        </div>
        <span>COMING SOON</span>
        <h2>숫자로 만나는 진주</h2>
        <p>
          진주의 다양한 통계와 인포그래픽을 담을 공간이에요.
          <br />
          기록을 준비하고 있어요.
        </p>
      </section>
    </main>
  );
}

function ContactLine() {
  const { settings } = useSite();
  return settings.contact_email ? (
    <a href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a>
  ) : (
    <span>문의 이메일 준비 중</span>
  );
}

export function Privacy() {
  return (
    <main className="wrap legalpage">
      <span className="eyebrow">PRIVACY</span>
      <h1>개인정보처리방침</h1>
      <div className="legalcopy">
        <p>진주랭킹(이하 「서비스」)은 이용자의 개인정보를 최소한으로 수집하고, 아래 목적 외에는 사용하지 않아요.</p>
        <h2>1. 수집하는 항목</h2>
        <ul>
          <li>
            <b>카카오 로그인 시</b>: 카카오가 제공하는 회원 식별값과 이용자가 동의한 항목(예: 닉네임, 이메일). 이 정보는 로그인 서비스(Supabase)의 사용자 목록에
            저장될 수 있으나, 서비스 화면에 표시하거나 투표 기록에 복사하지 않아요.
          </li>
          <li>
            <b>순위 반영 기록</b>: 임의로 만들어진 사용자 ID, 랭킹, 대결 기록, 반영 시각
          </li>
          <li>
            <b>직접 작성한 글</b>: 댓글, 의견(후보 추천·이의 제기·신고), 랭킹 제안, 설문조사 게시글과 동의 시각
          </li>
          <li>
            <b>통계</b>: 조회·완주 수 집계를 위한 브라우저 임의 식별값(복원할 수 없도록 해시 처리해 저장)
          </li>
          <li>
            <b>이 기기에만 저장</b>: 진행 중인 플레이와 내 결과는 브라우저 저장소에만 남고 서버로 보내지 않아요(순위에 반영할 때만 대결 기록을 보내요).
          </li>
        </ul>
        <h2>2. 이용 목적</h2>
        <p>한 사람이 한 랭킹에 표를 하나만 반영하도록 하는 중복 투표 방지, 순위 집계, 댓글·의견 운영, 부정 이용 방지에만 사용해요.</p>
        <h2>3. 보관 기간</h2>
        <p>
          회원 정보와 순위 반영 기록은 삭제를 요청하거나 서비스가 종료될 때까지 보관해요. 댓글은 작성자가 지우면 바로 삭제되고, 의견·제안·설문 게시글은 운영
          기록으로 보관하다가 삭제 요청 시 지워요.
        </p>
        <h2>4. 삭제 요청</h2>
        <p>
          회원 정보와 기록 삭제, 게시물 삭제(명예훼손 등) 요청은 아래 문의처로 보내주세요. 확인 후 지체 없이 처리해요. 자동 탈퇴 기능은 준비 중이에요.
        </p>
        <h2>5. 처리를 맡기는 서비스</h2>
        <ul>
          <li>카카오: 로그인</li>
          <li>Supabase: 데이터베이스·로그인·사진 저장 (해외 서버에 저장될 수 있어요)</li>
          <li>Vercel: 웹사이트 호스팅</li>
          <li>Google Fonts: 글꼴 제공 (글꼴을 불러올 때 접속 정보가 전달될 수 있어요)</li>
        </ul>
        <h2>6. 만 14세 미만</h2>
        <p>로그인은 만 14세 이상만 이용할 수 있어요. 로그인 없이 플레이하는 것은 누구나 가능해요.</p>
        <h2>7. 문의처</h2>
        <p>
          <ContactLine />
        </p>
        <p className="muted">시행일: {EFFECTIVE_DATE}</p>
      </div>
    </main>
  );
}

export function Terms() {
  return (
    <main className="wrap legalpage">
      <span className="eyebrow">TERMS</span>
      <h1>이용약관</h1>
      <div className="legalcopy">
        <h2>1. 서비스</h2>
        <p>진주랭킹은 진주와 관련된 주제를 둘씩 비교해 고르고, 참여자들의 선택을 순위로 모으는 서비스예요. 순위는 참여자들의 선택이며 진주시민 전체의 평가를 대표하지 않아요.</p>
        <h2>2. 이용</h2>
        <p>플레이는 로그인 없이 할 수 있어요. 순위 반영, 전체 순위 보기, 댓글, 의견 보내기, 랭킹 제안, 설문 올리기는 로그인이 필요해요. 한 사람이 랭킹마다 반영할 수 있는 결과는 1개예요.</p>
        <h2>3. 게시물</h2>
        <p>
          타인의 권리를 침해하거나 개인정보, 광고·홍보, 욕설이 담긴 글은 올리지 마세요. 운영자는 이런 게시물을 숨기거나 삭제할 수 있어요. 랭킹 제안은 운영자의 승인 후
          공개되고, 설문 게시글의 수정·삭제도 운영자 승인 후 반영돼요.
        </p>
        <h2>4. 금지 행위</h2>
        <p>여러 계정을 만들거나 조작된 요청으로 순위를 왜곡하는 행위는 금지돼요. 의심되는 표는 집계에서 제외될 수 있어요.</p>
        <h2>5. 문의</h2>
        <p>
          <ContactLine />
        </p>
        <p className="muted">시행일: {EFFECTIVE_DATE}</p>
      </div>
    </main>
  );
}

export function Contact() {
  const { openModal } = useUi();
  return (
    <main className="wrap legalpage">
      <span className="eyebrow">CONTACT</span>
      <h1>문의</h1>
      <div className="legalcopy">
        <p>광고, 랭킹 제안, 설문조사 의뢰, 게시물·개인정보 삭제 요청은 아래로 연락해주세요.</p>
        <p className="contactline">
          <Mail size={18} /> <ContactLine />
        </p>
        <div className="resultactions left">
          <button className="secondary" onClick={() => openModal({ type: 'inquiry', kind: 'advertising' })}>
            광고 문의
          </button>
          <button className="secondary" onClick={() => openModal({ type: 'inquiry', kind: 'survey' })}>
            설문조사 의뢰
          </button>
          <button className="secondary" onClick={() => openModal({ type: 'contribute' })}>
            랭킹 제안
          </button>
        </div>
      </div>
    </main>
  );
}

export function NotFound() {
  return (
    <main className="wrap">
      <div className="empty">
        <h2>페이지를 찾을 수 없어요.</h2>
        <Link className="secondary" to="/">
          홈으로
        </Link>
      </div>
    </main>
  );
}
