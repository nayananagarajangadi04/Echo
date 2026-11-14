/* Forwards supabase-js traffic (/rest/v1/*) to a local PostgREST instance.
   Used with scripts/verify-supabase.mts and for running ECHO against a local
   PostgreSQL + PostgREST stack: SUPABASE_URL=http://localhost:3002 */
import http from "node:http";

const REST_HOST = process.env.REST_HOST || "localhost";
const REST_PORT = Number(process.env.REST_PORT || 3001);
const LISTEN_PORT = Number(process.env.LISTEN_PORT || 3002);

const proxy = http.createServer((req, res) => {
  const target = req.url?.startsWith("/rest/v1") ? req.url.slice("/rest/v1".length) || "/" : req.url || "/";
  const upstream = http.request(
    {
      host: REST_HOST,
      port: REST_PORT,
      path: target,
      method: req.method,
      headers: { ...req.headers, host: `${REST_HOST}:${REST_PORT}` },
    },
    (up) => {
      res.writeHead(up.statusCode || 500, up.headers);
      up.pipe(res);
    }
  );
  req.pipe(upstream);
  upstream.on("error", (e) => {
    res.writeHead(502);
    res.end(String(e));
  });
});

proxy.listen(LISTEN_PORT, () => {
  console.log(`rest/v1 proxy: ${LISTEN_PORT} -> ${REST_HOST}:${REST_PORT}`);
});
