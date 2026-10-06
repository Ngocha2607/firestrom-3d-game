// worker/index.js — Cloudflare deployment of Bão Lửa: static files + one Durable Object per room.
// Same relay protocol as server.js: guests --(inputs)--> host browser --(snapshots)--> guests
import { DurableObject } from 'cloudflare:workers';

const ROOM_RE = /^[A-Z0-9]{4,8}$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if ((req.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      const room = (url.searchParams.get('room') || '').toUpperCase();
      if (!ROOM_RE.test(room)) return new Response('Bad room code', { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(req);
    }
    if (url.pathname === '/lan-info') return Response.json({ online: true }, { headers: { 'cache-control': 'no-store' } });
    return env.ASSETS.fetch(req);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.host = null;
    this.guests = new Map();
    this.nextId = 1;
  }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const c = { id: this.nextId++, ws: server, role: null };
    server.addEventListener('message', e => { if (typeof e.data === 'string') this.onMessage(c, e.data); });
    server.addEventListener('close', () => this.drop(c));
    server.addEventListener('error', () => this.drop(c));
    return new Response(null, { status: 101, webSocket: client });
  }

  send(c, obj) { try { c.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch (e) { this.drop(c); } }

  onMessage(c, msg) {
    // host snapshots are relayed verbatim without parsing
    if (c === this.host && msg.startsWith('{"t":"snap"')) {
      for (const g of this.guests.values()) this.send(g, msg);
      return;
    }
    let m; try { m = JSON.parse(msg); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello' && !c.role) {
      if (m.role === 'host') {
        if (this.host) { this.send(c, { t: 'error', msg: 'Phòng đã có chủ. Hãy bấm “Vào phòng”.' }); return; }
        this.host = c; c.role = 'host';
        this.send(c, { t: 'welcome', id: c.id, role: 'host' });
        for (const g of this.guests.values()) { this.send(c, { t: 'join', id: g.id }); this.send(g, { t: 'hostup' }); }
      } else {
        c.role = 'guest'; this.guests.set(c.id, c);
        this.send(c, { t: 'welcome', id: c.id, role: 'guest', hostReady: !!this.host });
        if (this.host) this.send(this.host, { t: 'join', id: c.id });
      }
      return;
    }
    if (c.role === 'guest' && this.host && m.t === 'in' && typeof m.slot === 'string' && m.slot.length < 16 && m.k && typeof m.k === 'object') {
      this.send(this.host, { t: 'in', from: c.id, slot: m.slot, k: m.k });
    }
  }

  drop(c) {
    if (c.dropped) return;
    c.dropped = true;
    try { c.ws.close(1000); } catch (e) { }
    if (c === this.host) {
      this.host = null;
      for (const g of this.guests.values()) this.send(g, { t: 'hostgone' });
    } else if (this.guests.delete(c.id) && this.host) {
      this.send(this.host, { t: 'leave', id: c.id });
    }
  }
}
