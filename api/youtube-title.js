// Only a fixed YouTube endpoint is queried; no user-supplied host or full URL.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const id = req.query.id;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(id)) return res.status(400).json({error:'invalid_video'});
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`, {signal:AbortSignal.timeout(4000)});
    if (!response.ok) return res.status(404).json({error:'unavailable'});
    const data = await response.json();
    if (typeof data.title !== 'string') return res.status(404).json({error:'unavailable'});
    res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({title:data.title.slice(0,300)});
  } catch {return res.status(502).json({error:'unavailable'});}
}
