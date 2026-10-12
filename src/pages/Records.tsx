import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AppContext';
import { api } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { compressImage } from '../lib/image';
import type { RecordArticle } from '../lib/types';
export default function Records() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<RecordArticle[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    api
      .listRecords()
      .then(setRows)
      .catch((e) => setError(friendlyError(e)));
  }, []);
  return (
    <main className="wrap records-page">
      <span className="eyebrow">JINJU ARCHIVE</span>
      <h1>진주기록</h1>
      {isAdmin && (
        <Link className="primary" to="/admin?tab=records">
          상세페이지 업로드·관리
        </Link>
      )}
      {error && <p className="error">{error}</p>}
      {!rows.length && !error && (
        <section className="records-empty">
          <h2>숫자로 만나는 진주</h2>
          <p>진주의 다양한 통계와 인포그래픽을 준비하고 있어요.</p>
        </section>
      )}
      {rows.map((r) => (
        <article className="record-article" key={r.id}>
          <h2>{r.title}</h2>
          <img src={r.image_url} alt={r.title} loading="lazy" />
        </article>
      ))}
    </main>
  );
}
export function RecordsAdmin() {
  const [rows, setRows] = useState<RecordArticle[]>([]),
    [title, setTitle] = useState(''),
    [file, setFile] = useState<File | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [inputKey, setInputKey] = useState(0);
  const load = useCallback(
    () =>
      api
        .listRecords()
        .then(setRows)
        .catch((e) => setError(friendlyError(e))),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const upload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw Error('JPG, PNG, WebP 이미지를 선택해주세요.');
      const blob = await compressImage(file, { maxInputMb: 8, maxSide: 6000, quality: 0.9 });
      const url = await api.uploadMedia(blob, 'records');
      await api.adminAddRecord(title, url);
      setTitle('');
      setFile(null);
      setInputKey((k) => k + 1);
      await load();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h2>진주기록 상세페이지 업로드</h2>
      <p>제작한 상세페이지 이미지를 올리면 원래 비율로 공개돼요. 업로드는 관리자만 할 수 있어요.</p>
      <form className="contactform community-editor" onSubmit={upload}>
        <label>
          제목
          <input maxLength={120} required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          상세페이지 이미지 (JPG·PNG·WebP, 최대 8MB)
          <input
            key={inputKey}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button className="primary" disabled={busy || !title.trim() || !file}>
          {busy ? '업로드 중…' : '업로드'}
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="adminlist">
        {rows.map((r) => (
          <article key={r.id}>
            <h3>{r.title}</h3>
            <button
              disabled={busy}
              onClick={async () => {
                if (!confirm('이 진주기록을 삭제할까요?')) return;
                setBusy(true);
                try {
                  await api.adminDeleteRecord(r.id);
                  await load();
                } catch (e) {
                  setError(friendlyError(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              삭제
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
