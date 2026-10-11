import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  onClose: () => void;
  labelledBy?: string;
  label?: string;
  wide?: boolean;
  children: ReactNode;
}

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)';

export default function Modal({ onClose, labelledBy, label, wide, children }: Props) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  // 바깥을 눌렀다 뗀 경우에만 닫는다 (창이 뜨는 순간의 클릭이나 드래그로 닫히지 않게)
  const pressedOutside = useRef(false);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key !== 'Tab' || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        pressedOutside.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedOutside.current && e.target === e.currentTarget) onClose();
        pressedOutside.current = false;
      }}
    >
      <section
        ref={ref}
        className={'modal' + (wide ? ' modal-wide' : '')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={label}
      >
        <button autoFocus className="close iconbtn" aria-label="닫기" onClick={onClose}>
          <X size={22} />
        </button>
        {children}
      </section>
    </div>
  );
}
