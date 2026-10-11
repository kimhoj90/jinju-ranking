import { ArrowRight, Lock, Mail } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, useSite, type GlobalModal } from '../context/AppContext';
import { loginPath } from './LoginPrompt';
import Modal from './Modal';

const INQUIRY_PLACEHOLDER = '-진주랭킹에 광고를 원하시나요?\n-제안하고 싶은 랭킹전이 있으신가요?\n-의뢰하고 싶은 설문조사가 있나요?';

function InquiryModal({ kind, onClose }: { kind: 'advertising' | 'survey'; onClose: () => void }) {
  const { settings } = useSite();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState(kind === 'survey' ? '설문조사 의뢰' : '광고 문의');
  const [body, setBody] = useState('');
  const email = settings.contact_email;
  const ready = title.trim() && body.trim();

  return (
    <Modal onClose={onClose} labelledBy="modal-title">
      <div className="loginicon">
        <Mail size={27} />
      </div>
      <h2 id="modal-title">{kind === 'survey' ? '설문조사 의뢰' : '광고문의'}</h2>
      <div className="contactform">
        <label>
          제목
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          내용
          <textarea rows={7} value={body} maxLength={4000} placeholder={INQUIRY_PLACEHOLDER} onChange={(e) => setBody(e.target.value)} />
        </label>
        {email ? (
          <>
            <p className="muted">받는 사람 · {email}</p>
            <a
              className={'primary full' + (ready ? '' : ' disabledlink')}
              aria-disabled={!ready}
              onClick={(e) => !ready && e.preventDefault()}
              href={`mailto:${email}?subject=${encodeURIComponent('[진주랭킹] ' + title)}&body=${encodeURIComponent(body)}`}
            >
              <Mail size={17} /> 메일 앱에서 보내기
            </a>
            <small>메일 앱이 열리면 내용을 확인하고 전송해주세요.</small>
          </>
        ) : (
          <div className="connectionnotice">
            <b>관리자 문의 주소를 준비 중이에요.</b>
            {isAdmin ? (
              <button
                className="textbtn"
                onClick={() => {
                  onClose();
                  navigate('/admin?tab=ads');
                }}
              >
                광고·문의 설정에서 주소 등록 <ArrowRight size={14} />
              </button>
            ) : (
              <p>문의 주소가 등록되면 메일을 보낼 수 있어요.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function ContributeModal({ onClose, onSurvey }: { onClose: () => void; onSurvey: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <Modal onClose={onClose} labelledBy="modal-title">
      <span className="eyebrow">LET'S MAKE IT TOGETHER</span>
      <h2 id="modal-title">어떤 이야기를 들려주실래요?</h2>
      <div className="contribute-options">
        <button
          onClick={() => {
            onClose();
            navigate(user ? '/propose' : loginPath('/propose'));
          }}
        >
          <span>랭킹 제안</span>
          <p>후보를 직접 구성해 관리자에게 제안해요. {user ? '' : '(로그인 필요)'}</p>
          <ArrowRight size={20} />
        </button>
        <button onClick={onSurvey}>
          <span>설문조사 의뢰</span>
          <p>진주에 궁금한 것이 있다면 메일로 의뢰해요.</p>
          <ArrowRight size={20} />
        </button>
      </div>
    </Modal>
  );
}

function AccountModal({ onClose }: { onClose: () => void }) {
  const { signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  return (
    <Modal onClose={onClose} labelledBy="modal-title">
      <div className="loginicon">
        <Lock size={25} />
      </div>
      <h2 id="modal-title">로그인되어 있어요</h2>
      <p>순위 반영, 댓글, 의견 보내기, 랭킹 제안, 설문 올리기를 이용할 수 있어요.</p>
      {isAdmin && (
        <button
          className="secondary full"
          onClick={() => {
            onClose();
            navigate('/admin');
          }}
        >
          관리 페이지로
        </button>
      )}
      <button
        className="secondary full"
        onClick={async () => {
          await signOut();
          onClose();
          navigate('/');
        }}
      >
        로그아웃
      </button>
      <small>
        탈퇴·기록 삭제는 <Link to="/privacy" onClick={onClose}>개인정보처리방침</Link>의 문의처로 요청해주세요.
      </small>
    </Modal>
  );
}

export function renderGlobalModal(modal: GlobalModal, close: () => void, open: (m: GlobalModal) => void) {
  if (!modal) return null;
  if (modal.type === 'inquiry') return <InquiryModal kind={modal.kind} onClose={close} />;
  if (modal.type === 'contribute') return <ContributeModal onClose={close} onSurvey={() => open({ type: 'inquiry', kind: 'survey' })} />;
  return <AccountModal onClose={close} />;
}
