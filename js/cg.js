// обвязка CrazyGames: на их площадке грузит SDK и докладывает о загрузке, геймплее и удачных
// моментах, а на сайте и в приложении превращается в тихие заглушки — игра от их CDN не зависит.
// ошибки SDK глотаются: сломанная аналитика не должна ломать игру
const CG = {
  active: false,
  sdk: null,

  // площадка: хосты crazygames и любой iframe — региональные зеркала площадки крутят игру
  // во фрейме со своего CDN. отдельно открытая игра (сайт, приложение) — всегда верхнее окно
  get onPortal() {
    if (/(^|\.)crazygames\./.test(location.hostname)) {
      return true;
    }
    try {
      return window.self !== window.top;
    } catch (err) {
      return true;
    }
  },

  // SDK инициализируется до старта игры, иначе не прочитать параметры приглашения.
  // вне площадки (и если скрипт не доехал) игра стартует сразу. сторожевой таймер
  // спасает от зависшего скрипта или init в чужом iframe: игра стартует без SDK,
  // опоздавшая инициализация игнорируется
  boot(onReady) {
    if (!this.onPortal) {
      onReady();
      return;
    }
    let started = false;
    const start = (activate) => {
      if (started) {
        return;
      }
      started = true;
      if (activate) {
        this.sdk = window.CrazyGames.SDK;
        this.active = true;
        this.call('loadingStart');
      }
      onReady();
    };
    setTimeout(() => start(false), 6000);
    const script = document.createElement('script');
    script.src = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
    script.onload = () => {
      window.CrazyGames.SDK.init().then(() => start(true), () => start(false));
    };
    script.onerror = () => start(false);
    document.head.appendChild(script);
  },

  call(method) {
    if (!this.active) {
      return;
    }
    try {
      this.sdk.game[method]();
    } catch (err) {
      // площадка переживёт пропущенное событие
    }
  },

  loadingStop() {
    this.call('loadingStop');
  },

  gameplayStart() {
    this.call('gameplayStart');
  },

  gameplayStop() {
    this.call('gameplayStop');
  },

  happytime() {
    this.call('happytime');
  },

  // ссылка-приглашение на страницу игры на площадке; пустая строка — делаем ссылку сами
  inviteLink(params) {
    if (!this.active) {
      return Promise.resolve('');
    }
    try {
      return Promise.resolve(this.sdk.game.inviteLink(params)).catch(() => '');
    } catch (err) {
      return Promise.resolve('');
    }
  },

  memoryStore: null,

  // localStorage бывает запрещён целиком (iframe при строгих настройках куки) —
  // тогда прогресс живёт в памяти до конца вкладки, но игра хотя бы работает
  localStore() {
    try {
      localStorage.getItem('fruktolet.probe');
      return localStorage;
    } catch (err) {
      if (!this.memoryStore) {
        const memory = {};
        this.memoryStore = {
          getItem: (key) => (key in memory ? memory[key] : null),
          setItem: (key, value) => {
            memory[key] = String(value);
          },
          removeItem: (key) => {
            delete memory[key];
          },
        };
      }
      return this.memoryStore;
    }
  },

  // куда писать прогресс: на площадке — их data-модуль (интерфейс localStorage, облако
  // для залогиненных), иначе localStorage с фолбэком в память. Автосейв площадки в iframe не работает
  store() {
    return this.active && this.sdk.data ? this.sdk.data : this.localStore();
  },

  // площадка глушит звук своим тумблером: отдаём игре и текущее значение, и все изменения
  watchSettings(onMute) {
    if (!this.active) {
      return;
    }
    try {
      const apply = (settings) => {
        if (settings && typeof settings.muteAudio === 'boolean') {
          onMute(settings.muteAudio);
        }
      };
      this.sdk.game.addSettingsChangeListener(apply);
      apply(this.sdk.game.settings);
    } catch (err) {
      // без настроек площадки звук просто остаётся под управлением игры
    }
  },

  // пати-лидер мгновенного мультиплеера должен сразу открыть комнату для друзей
  get instantMultiplayer() {
    if (!this.active) {
      return false;
    }
    try {
      return Boolean(this.sdk.game.isInstantMultiplayer);
    } catch (err) {
      return false;
    }
  },

  // состояние комнаты для соцслоя площадки: кто в игре и можно ли присоединиться
  updateRoom(token, joinable) {
    if (!this.active) {
      return;
    }
    try {
      this.sdk.game.updateRoom({ roomId: token, isJoinable: joinable, inviteParams: { r: token } });
    } catch (err) {
      // соцслой переживёт
    }
  },

  leftRoom() {
    if (!this.active) {
      return;
    }
    try {
      this.sdk.game.leftRoom();
    } catch (err) {
      // соцслой переживёт
    }
  },

  // друг позвал в комнату, пока игра открыта: площадка отдаёт параметры без перезагрузки
  onJoinRoom(listener) {
    if (!this.active) {
      return;
    }
    try {
      this.sdk.game.addJoinRoomListener((params) => {
        if (params && params.r) {
          listener(String(params.r));
        }
      });
    } catch (err) {
      // без слушателя вход остаётся по ссылке
    }
  },

  inviteParam(name) {
    if (!this.active) {
      return null;
    }
    try {
      return this.sdk.game.getInviteParam(name);
    } catch (err) {
      return null;
    }
  },
};
