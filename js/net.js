// P2P-кооп через WebRTC: своего сервера нет, только публичный брокер PeerJS для рукопожатия.
// Хост считает всю игру и рассылает снимки состояния, гость шлёт только свой ввод.
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

class Net {
  constructor(handlers) {
    this.handlers = handlers;
    this.peer = null;
    this.conn = null;
    this.role = 'solo';
    this.token = '';
    this.status = 'offline';
  }

  get available() {
    return typeof window.Peer === 'function';
  }

  get connected() {
    return Boolean(this.conn && this.conn.open);
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
    });

    this.peer.on('connection', (conn) => {
      // приглашение одноразовое: второго гостя в комнату не пускаем
      if (this.connected) {
        conn.close();
        return;
      }
      this.bind(conn);
    });

    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        this.invite();
        return;
      }
      this.setStatus('error', t('net.error', { type: err.type }));
    });
  }

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
    this.setStatus('connecting', t('net.connecting'));
    this.peer = new window.Peer({ debug: 0 });

    this.peer.on('open', () => {
      this.bind(this.peer.connect(NET_PREFIX + token, { reliable: true }));
    });

    this.peer.on('error', (err) => {
      const text2 = err.type === 'peer-unavailable' ? t('net.notFound') : t('net.error', { type: err.type });
      this.setStatus('error', text2);
    });
  }

  bind(conn) {
    this.conn = conn;
    conn.on('open', () => {
      this.setStatus('online', t(this.role === 'host' ? 'net.friendJoined' : 'net.joined'));
      this.handlers.onOpen(this.role);
    });
    conn.on('data', (data) => this.handlers.onData(data));
    conn.on('close', () => {
      this.conn = null;
      this.setStatus('offline', t('net.closed'));
      this.handlers.onClose();
    });
    conn.on('error', () => {
      this.setStatus('error', t('net.dropped'));
    });
  }

  send(payload) {
    if (this.connected) {
      this.conn.send(payload);
    }
  }

  close() {
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
