// api/api.js
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getCache } from '../cache.js'; // <- só isso; nada de importar a si próprio

const router = express.Router();

function cachePath(key) {
  return path.join(process.cwd(), 'cache', `${key}.json`);
}

function addHttpCacheHeaders(req, res, filePath, { immutable }) {
  const stat = fs.statSync(filePath);
  const lastModified = stat.mtime.toUTCString();
  const body = fs.readFileSync(filePath);
  const etag = '"' + crypto.createHash('sha1').update(body).digest('hex') + '"';

  const inm = req.headers['if-none-match'];
  const ims = req.headers['if-modified-since'];
  if (inm === etag || (ims && new Date(ims) >= stat.mtime)) {
    res.status(304).end();
    return { notModified: true };
  }
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', lastModified);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    immutable ? 'public, max-age=31536000, immutable'
              : 'public, max-age=15, stale-while-revalidate=30'
  );
  return { notModified: false };
}

function isoDate(d = new Date()) {
  const local = new Date(d.getTime() - 3 * 60 * 60 * 1000); // UTC-3
  return local.toISOString().slice(0, 10);
}

// healthcheck (teste rápido)
router.get('/health', (_req, res) => res.json({ ok: true, where: '/v1/health' }));

// /v1/jogos?date=YYYY-MM-DD
router.get('/jogos', (req, res) => {
  const key = req.query.date || isoDate();
  const file = cachePath(key);
  const data = getCache(key);
  if (!data) return res.status(503).json({ message: `Cache para ${key} ainda não pronto.` });
  const { notModified } = addHttpCacheHeaders(req, res, file, { immutable: true });
  if (notModified) return;
  res.status(200).send(JSON.stringify(data));
});

// /v1/jogos/hoje
router.get('/jogos/hoje', (req, res) => {
  const key = isoDate();
  const file = cachePath(key);
  const data = getCache(key);
  if (!data) return res.status(503).json({ message: `Cache para ${key} ainda não pronto.` });
  const { notModified } = addHttpCacheHeaders(req, res, file, { immutable: true });
  if (notModified) return;
  res.status(200).send(JSON.stringify(data));
});

// /v1/jogos/amanha
router.get('/jogos/amanha', (req, res) => {
  const d = new Date(); d.setDate(d.getDate() + 1);
  const key = isoDate(d);
  const file = cachePath(key);
  const data = getCache(key);
  if (!data) return res.status(503).json({ message: `Cache para ${key} ainda não pronto.` });
  const { notModified } = addHttpCacheHeaders(req, res, file, { immutable: true });
  if (notModified) return;
  res.status(200).send(JSON.stringify(data));
});

// /v1/jogos/agora
router.get('/jogos/agora', (req, res) => {
  const key = 'agora';
  const file = cachePath(key);
  const data = getCache(key);
  if (!data) return res.status(503).json({ message: 'Cache do AGORA ainda não pronto.' });
  const { notModified } = addHttpCacheHeaders(req, res, file, { immutable: false });
  if (notModified) return;
  res.status(200).send(JSON.stringify(data));
});

export default router; // <- **export default** obrigatório
