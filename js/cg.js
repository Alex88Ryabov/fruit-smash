// обвязка CrazyGames: на их площадке грузит SDK и докладывает о загрузке, геймплее и удачных
// моментах, а на сайте и в приложении превращается в тихие заглушки — игра от их CDN не зависит.
// ошибки SDK глотаются: сломанная аналитика не должна ломать игру
const CG = {
  active: false,
  sdk: null,

  // хосты площадки: сама crazygames.com и её игровые CDN-поддомены
  get onPortal() {
    return /(^|\.)crazygames\./.test(location.hostname);
  },

  // SDK инициализируется до старта игры, иначе не прочитать параметры приглашения.
  // вне площадки (и если скрипт не доехал) игра стартует сразу
  boot(onReady) {
    if (!this.onPortal) {
      onReady();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
    script.onload = () => {
      window.CrazyGames.SDK.init().then(() => {
        this.sdk = window.CrazyGames.SDK;
        this.active = true;
        this.call('loadingStart');
        onReady();
      }, onReady);
    };
    script.onerror = onReady;
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
