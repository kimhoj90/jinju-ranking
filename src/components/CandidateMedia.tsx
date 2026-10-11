import type { Candidate } from '../lib/types';

/** 후보 사진(4:3, 가운데 기준으로 채움)과 이름·부연설명 */
export default function CandidateMedia({ candidate }: { candidate: Pick<Candidate, 'name' | 'sub' | 'image_url'> | undefined }) {
  if (!candidate) return null;
  return (
    <>
      {candidate.image_url ? (
        <img className="candidate-photo" src={candidate.image_url} alt="" draggable={false} />
      ) : (
        <div className="candidate-no-photo" aria-hidden="true">
          <span>{candidate.name.trim().slice(0, 1)}</span>
        </div>
      )}
      <div className="candidate-caption">
        <h2>{candidate.name}</h2>
        {candidate.sub && <p>{candidate.sub}</p>}
      </div>
    </>
  );
}
