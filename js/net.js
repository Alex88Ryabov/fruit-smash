// P2P-кооп через WebRTC: своего сервера нет, только публичный брокер PeerJS для рукопожатия.
// Хост считает всю игру и рассылает снимки состояния всем гостям, гости шлют только свой ввод.
// Войти можно только по приглашению: комната живёт под длинным случайным токеном,
// который хост передаёт сам — подобрать или перебрать его нельзя.
const NET_PREFIX = 'fruktolet-';
const TOKEN_LENGTH = 16;

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
    this.denied2 = false;
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

  setStatus(status, text) {
    this.status = status;
    this.handlers.onStatus(status, text);
  }

  // ---------- хост ----------

  invite() {
    if (!this.available) {
      this.setStatus('error', t('net.noPeer'));
      return;
    }
    this.close();
    this.role = 'host';
    this.token = inviteToken();
    this.setStatus('connecting', t('net.preparing'));
    this.peer = new window.Peer(NET_PREFIX + this.token, { debug: 0 });

    this.peer.on('open', () => {
      this.setStatus('waiting', t('net.ready'));
      this.handlers.onInvite(this.inviteLink);
      publicIp().then((ip) => { this.myIp = ip; });
    });

    this.peer.on('connection', (conn) => {
      conn.on('data', (data) => this.hostData(conn, data));
      conn.on('close', () => this.dropGuest(conn));
      conn.on('error', () => this.dropGuest(conn));
    });

    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        this.invite();
        return;
      }
      this.setStatus('error', t('net.error', { type: err.type }));
    });
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
    if (!this.available) {
      this.setStatus('error', t('net.noPeer'));
      return;
    }
    const token = parseInvite(text);
    if (!token) {
      this.setStatus('error', t('net.badInvite'));
      return;
    }
    this.close();
    this.role = 'guest';
    this.token = token;
    this.denied2 = false;
    this.setStatus('connecting', t('net.connecting'));
    this.peer = new window.Peer({ debug: 0 });

    this.peer.on('open', () => {
      const conn = this.peer.connect(NET_PREFIX + token, { reliable: true });
      this.conn = conn;

      conn.on('open', () => {
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
        if (!this.denied2) {
          this.setStatus('offline', t('net.closed'));
          this.handlers.onClose();
        }
      });
      conn.on('error', () => {
        if (!this.denied2) {
          this.setStatus('error', t('net.dropped'));
        }
      });
    });

    this.peer.on('error', (err) => {
      const text2 = err.type === 'peer-unavailable' ? t('net.notFound') : t('net.error', { type: err.type });
      this.setStatus('error', text2);
    });
  }

  denied(reason) {
    this.denied2 = true;
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
