// P2P-кооп через WebRTC: своего сервера нет, только публичный брокер PeerJS для рукопожатия.
// Хост считает всю игру и рассылает снимки состояния всем гостям, гости шлют только свой ввод.
// Войти можно только по приглашению: комната живёт под длинным случайным токеном,
// который хост передаёт сам — подобрать или перебрать его нельзя.
const NET_PREFIX = 'fruktolet-';
const TOKEN_LENGTH = 16;
// ошибки, после которых комната не потеряна: это оборванный сокет до брокера, а не отказ
const BROKER_ERRORS = ['network', 'socket-error', 'socket-closed', 'server-error'];
const REVIVE_DELAY = 3000;
const MAX_REVIVES = 12;
const JOIN_RETRY_DELAY = 3000;
const MAX_JOIN_TRIES = 6;

function inviteToken() {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

// принимаем и голый токен, и ссылку целиком — из неё выдёргиваем токен
function parseInvite(text) {
  const match = String(text).trim().match(new RegExp('[a-z0-9]{' + TOKEN_LENGTH + '}', 'i'));
  return match ? match[0].toLowerCase() : '';
}

// метка браузера: по ней хост узнаёт свою же вкладку, открытую по собственной ссылке
function deviceId() {
  let id = localStorage.getItem('fruktolet.device');
  if (!id) {
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (b) => (b % 36).toString(36)).join('');
    localStorage.setItem('fruktolet.device', id);
  }
  return id;
}

// свой публичный адрес узнаём сами: пустое соединение к STUN отдаёт srflx-кандидат.
// из SDP его читать нельзя — при trickle ICE кандидаты приходят отдельно и позже
function publicIp(timeout = 2000) {
  return new Promise((resolve) => {
    let pc = null;
    let done = false;
    const finish = (ip) => {
      if (done) {
        return;
      }
      done = true;
      if (pc) {
        try {
          pc.close();
        } catch (err) {
          // соединение уже закрыто
        }
      }
      resolve(ip);
    };

    try {
      pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    } catch (err) {
      finish('');
      return;
    }

    pc.createDataChannel('ip');
    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        finish('');
        return;
      }
      const line = event.candidate.candidate || '';
      if (line.includes('typ srflx')) {
        finish(line.split(' ')[4] || '');
      }
    };
    pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch(() => finish(''));
    setTimeout(() => finish(''), timeout);
  });
}

class Net {
  constructor(handlers) {
    this.handlers = handlers;
    this.peer = null;
    this.role = 'solo';
    this.token = '';
    this.status = 'offline';
    this.conn = null;
    this.guests = [];
    this.device = deviceId();
    this.myIp = '';
    this.refused = false;
    this.revives = 0;
    this.tries = 0;
    this.rebuilt = false;

    // в фоне телефон рвёт сокет к брокеру: как только игрок вернулся в игру, поднимаем связь
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.wake();
      }
    });
  }

  wake() {
    if (this.role === 'host') {
      this.reviveRoom();
      return;
    }
    if (this.role === 'guest' && !this.connected) {
      this.tries = 0;
      this.retryJoin();
    }
  }

  get available() {
    return typeof window.Peer === 'function';
  }

  get openGuests() {
    return this.guests.filter((guest) => guest.conn && guest.conn.open);
  }

  get connected() {
    if (this.role === 'host') {
      return this.openGuests.length > 0;
    }
    return Boolean(this.conn && this.conn.open);
  }

  get playerCount() {
    return this.role === 'host' ? 1 + this.openGuests.length : 0;
  }

  get inviteLink() {
    if (!this.token) {
      return '';
    }
    const url = location.protocol === 'http:' || location.protocol === 'https:'
      ? location.origin + location.pathname
      : '';
    return url ? url + '#r=' + this.token : this.token;
  }

  // на CrazyGames игра живёт в iframe на их CDN: своя ссылка туда не приведёт,
  // поэтому просим у площадки ссылку на страницу игры с параметром комнаты
  resolveInviteLink() {
    const plain = this.inviteLink;
    return CG.inviteLink({ r: this.token }).then((link) => link || plain);
  }

  setStatus(status, text) {
    this.status = status;
    this.handlers.onStatus(status, text);
  }

  // ---------- хост ----------

  invite(token) {
    if (!this.available) {
      this.setStatus('error', t('net.noPeer'));
      return;
    }
    this.close();
    this.role = 'host';
    if (token) {
      this.token = token;
    } else {
      this.token = inviteToken();
      this.revives = 0;
    }
    this.setStatus('connecting', t('net.preparing'));
    this.peer = new window.Peer(NET_PREFIX + this.token, { debug: 0 });

    this.peer.on('open', () => {
      this.revives = 0;
      this.setStatus('waiting', this.rebuilt ? t('net.newRoom') : t('net.ready'));
      this.rebuilt = false;
      this.resolveInviteLink().then((link) => this.handlers.onInvite(link));
      publicIp().then((ip) => { this.myIp = ip; });
    });

    this.peer.on('connection', (conn) => {
      conn.on('data', (data) => this.hostData(conn, data));
      conn.on('close', () => this.dropGuest(conn));
      conn.on('error', () => this.dropGuest(conn));
    });

    this.peer.on('disconnected', () => this.reviveRoom());

    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        // имя занято: своя же прошлая регистрация — забираем обратно, чужая — берём новое
        if (this.revives > 0) {
          this.reviveRoom();
        } else {
          this.invite();
        }
        return;
      }
      if (BROKER_ERRORS.includes(err.type)) {
        this.reviveRoom();
        return;
      }
      this.setStatus('error', t('net.error', { type: err.type }));
    });
  }

  // комната живёт у брокера, пока жив сокет: поднимаем её под тем же токеном,
  // иначе ссылка, которую уже отправили другу, протухнет
  reviveRoom() {
    if (this.role !== 'host' || !this.token) {
      return;
    }
    if (this.peer && !this.peer.destroyed && !this.peer.disconnected) {
      return;
    }
    if (this.revives >= MAX_REVIVES) {
      // имя комнаты держит зависший сокет и уже не отпустит: открываем новую и говорим об этом
      this.revives = 0;
      this.rebuilt = true;
      this.invite();
      return;
    }
    this.revives += 1;
    this.setStatus('connecting', t('net.reviving'));
    const peer = this.peer;
    const token = this.token;
    // «связь потеряна» прилетает и когда peer уничтожают: дожидаемся, пока он дойдёт до конца.
    // reconnect на умирающем peer оставляет у брокера висячий сокет, и имя комнаты занимаем сами у себя
    setTimeout(() => {
      if (this.role !== 'host' || this.token !== token || this.status === 'waiting' || this.status === 'online') {
        return;
      }
      if (this.peer === peer && peer && peer.disconnected && !peer.destroyed) {
        peer.reconnect();
        return;
      }
      this.invite(token);
    }, REVIVE_DELAY);
  }

  hostData(conn, data) {
    if (data && data.t === 'join') {
      const reason = this.denyReason(conn, data);
      if (reason) {
        conn.send({ t: 'deny', reason });
        this.setStatus('waiting', t('net.rejected.' + reason));
        setTimeout(() => conn.close(), 400);
        return;
      }
      const slot = this.freeSlot();
      this.guests.push({ conn, slot, device: data.device, ip: data.ip || '', lastSeen: Date.now() });
      conn.send({ t: 'hello', slot });
      this.setStatus('online', t('net.inRoom', { n: this.playerCount }));
      this.handlers.onGuestJoin(slot);
      return;
    }
    const guest = this.guests.find((item) => item.conn === conn);
    if (guest) {
      guest.lastSeen = Date.now();
      this.handlers.onData(data, guest.slot);
    }
  }

  // проверки на входе: своя же вкладка, свой же интернет и лимит по игрокам
  denyReason(conn, data) {
    if (data.device && data.device === this.device) {
      return 'self';
    }
    if (this.openGuests.some((guest) => guest.device && guest.device === data.device)) {
      return 'self';
    }
    if (CONFIG.blockSameNetwork && data.ip) {
      if (this.myIp && data.ip === this.myIp) {
        return 'network';
      }
      if (this.openGuests.some((guest) => guest.ip && guest.ip === data.ip)) {
        return 'network';
      }
    }
    if (this.playerCount >= CONFIG.maxPlayers) {
      return 'full';
    }
    return '';
  }

  // гость мог закрыть вкладку: WebRTC узнаёт об этом слишком долго, поэтому следим сами
  checkAlive() {
    const now = Date.now();
    for (const guest of this.guests.slice()) {
      if (guest.lastSeen && now - guest.lastSeen > 4000) {
        try {
          guest.conn.close();
        } catch (err) {
          // соединение уже мертво
        }
        this.dropGuest(guest.conn);
      }
    }
  }

  freeSlot() {
    for (let slot = 1; slot < CONFIG.maxPlayers; slot++) {
      if (!this.openGuests.some((guest) => guest.slot === slot)) {
        return slot;
      }
    }
    return CONFIG.maxPlayers - 1;
  }

  dropGuest(conn) {
    const guest = this.guests.find((item) => item.conn === conn);
    this.guests = this.guests.filter((item) => item.conn !== conn);
    if (!guest) {
      return;
    }
    this.setStatus(this.connected ? 'online' : 'waiting', t('net.left', { n: this.playerCount }));
    this.handlers.onGuestLeave(guest.slot);
  }

  broadcast(payload) {
    for (const guest of this.openGuests) {
      guest.conn.send(payload);
    }
  }

  // ---------- гость ----------

  join(text) {
    const token = parseInvite(text);
    if (!token) {
      this.setStatus('error', t('net.badInvite'));
      return;
    }
    this.tries = 0;
    this.connectTo(token);
  }

  // хост мог уснуть на минуту вместе с телефоном: комната вернётся, поэтому стучимся ещё несколько раз
  retryJoin() {
    if (this.role !== 'guest' || !this.token) {
      return;
    }
    if (this.tries >= MAX_JOIN_TRIES) {
      this.setStatus('error', t('net.notFound'));
      return;
    }
    this.tries += 1;
    const token = this.token;
    this.setStatus('connecting', t('net.searching'));
    setTimeout(() => {
      if (this.role === 'guest' && this.token === token && !this.connected) {
        this.connectTo(token);
      }
    }, JOIN_RETRY_DELAY);
  }

  connectTo(token) {
    if (!this.available) {
      this.setStatus('error', t('net.noPeer'));
      return;
    }
    this.close();
    this.role = 'guest';
    this.token = token;
    this.refused = false;
    this.setStatus('connecting', this.tries > 0 ? t('net.searching') : t('net.connecting'));
    this.peer = new window.Peer({ debug: 0 });

    this.peer.on('open', () => {
      const conn = this.peer.connect(NET_PREFIX + token, { reliable: true });
      this.conn = conn;

      conn.on('open', () => {
        this.tries = 0;
        this.setStatus('connecting', t('net.handshake'));
        // свой публичный адрес отдаём сами: хост по нему видит вход из своей же сети
        publicIp().then((ip) => {
          this.myIp = ip;
          conn.send({ t: 'join', device: this.device, ip });
        });
      });

      conn.on('data', (data) => {
        if (!data) {
          return;
        }
        if (data.t === 'deny') {
          this.denied(data.reason);
          return;
        }
        if (data.t === 'hello') {
          this.setStatus('online', t('net.joined'));
          this.handlers.onOpen('guest', data.slot);
          return;
        }
        this.handlers.onData(data, 0);
      });

      conn.on('close', () => {
        this.conn = null;
        // если хост уже отказал, причину отказа не затираем
        if (!this.refused) {
          this.setStatus('offline', t('net.closed'));
          this.handlers.onClose();
          this.retryJoin();
        }
      });
      conn.on('error', () => {
        if (!this.refused) {
          this.setStatus('error', t('net.dropped'));
        }
      });
    });

    this.peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        this.retryJoin();
        return;
      }
      this.setStatus('error', t('net.error', { type: err.type }));
    });
  }

  denied(reason) {
    this.refused = true;
    this.setStatus('error', t('net.deny.' + reason));
    const peer = this.peer;
    this.peer = null;
    this.conn = null;
    this.role = 'solo';
    this.token = '';
    if (peer) {
      peer.destroy();
    }
    this.handlers.onClose();
  }

  send(payload) {
    if (this.conn && this.conn.open) {
      this.conn.send(payload);
    }
  }

  close() {
    for (const guest of this.guests) {
      if (guest.conn) {
        guest.conn.close();
      }
    }
    this.guests = [];
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.role = 'solo';
    this.token = '';
  }
}
