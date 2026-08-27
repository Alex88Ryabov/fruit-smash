# Материалы для площадок

## CrazyGames: подача по шагам

Игра уже заведена в кабинете (первая подача отклонена 2026-08-25), поэтому **новую карточку не создаём** — открываем существующую и загружаем новую версию файлов. В документации это описано так: «you can update your game at any time through your developer account. Simply upload the updated files and submit them for approval», и апдейты обычно проходят проверку в тот же рабочий день (срок первичного ревью нигде не назван).

**Шаг 1. Файлы игры.** Загружаем `dist/fruit-smash-crazygames-1.12.0.zip` (собирается `npm run crazygames`). Что при этом сходится с их требованиями:

| Требование | У нас |
| --- | --- |
| `index.html` в корне архива | да, сборка кладёт его в корень |
| только относительные пути | да; единственный внешний адрес — их же SDK |
| начальная загрузка ≤ 50 МБ | 1,9 МБ |
| всего ≤ 250 МБ и ≤ 1500 файлов | 1,9 МБ, 76 файлов |
| ≤ 20 МБ — порог для мобильной главной | проходим |
| мышь, клавиатура и тач | всё есть |
| sitelock | не обязателен («you **might** implement a sitelock»), у нас нет |
| уведомление о приватности | нужно, только если игра собирает данные сверх событий SDK — у нас не собирает |

**Шаг 2. Preview.** Перед отправкой прогнать игру их же инструментом (в кабинете: Submit a game → Preview) и посмотреть три вещи: попадаем ли сразу в геймплей, читается ли поле в мелком кадре (их проверочные размеры — 800×450 и 1080×607), нет ли ошибок в консоли.

**Шаг 3. Details.** Поля и что в них ставить — таблица ниже.

**Шаг 4. Обложки и ролики.** Файлы из `store/crazygames/`: три обложки и два ролика (19 с, без звука, первый кадр — обложка).

**Шаг 5. Отправка на ревью.** В комментарии к повторной подаче стоит перечислить, что изменилось с прошлого раза: спрайты вместо системных эмодзи, поле во весь кадр площадки, старт сразу в первый уровень, Esc не перехватывается, язык из локали SDK, добавлена фоновая музыка.

**Basic Launch или Full Launch.** Сейчас мы в Basic: SDK не обязателен, реклама выключена, доход не делится. Full Launch не выбирают сами — на него отбирает площадка; там обязательны SDK, реклама только через их SDK, привязка прогресса к аккаунту CrazyGames, а для мультиплеера — комнаты и инвайты. Наш SDK v3 уже подключён целиком (события загрузки и геймплея, data-модуль, комнаты, инвайты, локаль), так что переход не потребует переделки.

**Анкетные ответы:** PEGI 12 — проходим (сбитые фрукты лопаются без крови); внутриигровых покупок нет; своей рекламы нет; чата нет — приглашение уходит ссылкой наружу.

### Шаг Details: что выбирать

Материалы лежат в `store/crazygames/`, собираются скриптами из `tools/store/` (обложки — `node store/shoot-covers.js`, ролики — `node store/record-video.js landscape|portrait`; запускать из папки `tools` после `npm install`, ролику нужен ffmpeg).

| Поле | Что ставить |
| --- | --- |
| Category | `Shooting` (если нет — `Casual`) |
| Tags (макс. 5) | `2 player`, `co-op`, `arcade`, `physics`, `cartoon` |
| Google Play / iOS / Steam | пусто — игра ещё не в магазинах |
| Marketing creatives URL | пусто |
| Cover images | `cover-1920x1080.png`, `cover-800x1200.png`, `cover-800x800.png` |
| Preview videos | `preview-landscape.mp4` (1920×1080), `preview-portrait.mp4` (1080×1620) |
| Mobile orientation | BOTH (задаётся сборкой, менять нельзя) |
| Works well in fullscreen | да |
| "Online with Friends" Lobby Size | Min 2, Max 4 — совпадает с `CONFIG.maxPlayers` |

**Description**

```
The fruit learned to fly, and now it wants you gone. Grab a potato, pull back like a slingshot, mind the wind and knock every apple, cherry and watermelon out of the sky.

Keep hitting and the rage meter fills: your hero bursts into flames, the charge bar disappears and every shot flies at full power.

• Campaign: 5 gardens, 12 levels each, with wind, rain, night, acid puddles and rotten splashes
• Three stars per level: clear it, take no damage, complete the special goal
• Endless mode with a boss every fifth wave
• Upgrades between runs: hearts, reload speed, pickup magnet, starting weapon
• Weapons that change everything: mushroom spread shot, corn machine gun, exploding pineapple, homing carrot
• Ranks and a high score table to climb
• Co-op for up to 4 friends: one link and they land straight in your game
• English, Russian and Ukrainian
```

**Controls**

```
Mouse: aim with the cursor, hold the left button to charge, release to throw. A/D to run, SPACE to jump, P to pause, M for sound.
Touch: drag back from the hero and release to throw, drag along the bottom strip to run, tap the arrow to jump.
```

## Материалы для Google Play


Всё, что просит консоль при создании приложения. Тексты готовы к вставке, картинки лежат рядом.

## Что уже собрано

| Что | Где | Требование Play |
| --- | --- | --- |
| Подписанный пакет | `android/app/build/outputs/bundle/release/app-release.aab` | AAB, targetSdk 36 ✔ |
| Иконка 512×512 | `icons/icon-512.png` | PNG, 32-бит, 512×512 ✔ |
| Баннер | `store/feature-graphic.png` | 1024×500 ✔ |
| Скриншоты телефона | `store/screenshots/1-menu.png` … `4-upgrades.png` | 2–8 штук, 1440×3120 ✔ |
| Политика конфиденциальности | `privacy.html` → https://alex88ryabov.github.io/fruit-smash/privacy.html | публичный URL ✔ |

**Перед публикацией:** в `privacy.html` три раза стоит заглушка `ПОЧТА@ПРИМЕР` — подставь адрес для связи.

## Название и описания

**Название (до 30 знаков):** `Фруктолёт` · англ. `Fruit Smash` · укр. `Фруктоліт`

**Краткое описание (до 80 знаков)**

- ru: `Сбивай летающие фрукты картошкой: 60 уровней, прокачка и кооп до 4 игроков`
- en: `Knock flying fruit out of the sky: 60 levels, upgrades and co-op for four`
- uk: `Збивай літаючі фрукти картоплею: 60 рівнів, прокачка і кооп до 4 гравців`

**Полное описание (до 4000 знаков), ru**

```
Фрукты научились летать и решили закидать тебя. Отбивайся тем, что под рукой: картошкой, кукурузой, ананасом и самонаводящейся морковкой.

Тяни пальцем назад, как рогатку, целься с поправкой на ветер и отпускай. Прыгай через кислотные лужи, не поскользнись на банановой кожуре и держи комбо — за него множатся очки.

• Кампания: 5 садов по 12 уровней, у каждого свой модификатор — ветер, ливень, ночь, кислота, гнилые брызги.
• Три звезды за уровень: пройти, не получить урона и выполнить особую задачу.
• Прокачка между заходами: жизни, скорость перезарядки, радиус подбора, стартовое оружие.
• Бесконечный режим с волнами и боссами каждые пять волн.
• Кооп до 4 игроков по приглашению — друг открывает ссылку и оказывается в твоей игре.
• Три языка: русский, українська, English.
• Без рекламы, без покупок, без регистрации. Играется офлайн.
```

**Полное описание, en**

```
The fruit learned to fly and decided to pelt you. Fight back with whatever is at hand: potatoes, corn, pineapples and a homing carrot.

Pull back with your finger like a slingshot, aim with the wind in mind and let go. Jump over acid puddles, do not slip on banana peels and keep your combo — it multiplies the score.

• Campaign: 5 gardens, 12 levels each, every garden with its own twist — wind, rain, night, acid, rotten splashes.
• Three stars per level: clear it, take no damage and complete a special goal.
• Upgrades between runs: hearts, reload speed, pickup radius, starting weapon.
• Endless mode with waves and a boss every fifth wave.
• Co-op for up to 4 players by invitation — your friend opens a link and lands in your game.
• Three languages: Russian, Ukrainian, English.
• No ads, no purchases, no sign-up. Plays offline.
```

## Анкеты консоли

**Категория:** Игры → Аркады (Arcade). Теги: аркада, казуальная, для всей семьи.

**Возрастной рейтинг (IARC).** Отвечать так:

- насилие — нет (сбитые фрукты лопаются без крови);
- пугающие сцены, сексуальный контент, наркотики, азартные игры — нет;
- пользовательский контент и общение — нет (чата нет; ссылка-приглашение отправляется вне игры);
- покупки внутри приложения — нет;
- реклама — нет;
- передача местоположения — нет.

**Data safety.** Отвечать так:

- собираются ли данные — **нет**;
- передаются ли данные третьим лицам — **нет**;
- шифрование при передаче — да (WebRTC шифрует соединение сам);
- удаление данных — прогресс лежит только на устройстве и удаляется вместе с игрой;
- отдельно указать в описании соединения: для кооперативной игры используются сторонний брокер **PeerJS Cloud** и публичный **STUN-сервер Google**; при соединении им и участникам игры становится виден IP-адрес устройства. Игровые данные на эти серверы не попадают.

## Порядок публикации

1. В Play Console создать приложение: тип — игра, бесплатное, языки ru/uk/en.
2. Заполнить листинг текстами и картинками выше, указать ссылку на политику конфиденциальности.
3. Пройти анкеты: доступ к приложению (без ограничений), реклама (нет), возрастной рейтинг, целевая аудитория, Data safety, безопасность приложения.
4. Загрузить `app-release.aab` в **закрытое тестирование**.
5. Собрать **12 тестировщиков** и держать тест **14 дней подряд** — без этого личный аккаунт не пустит в продакшен. Список почт добавляется в закрытый трек.
6. После 14 дней — заявка на продакшен.

## Как пересобрать пакет

```bash
# из корня проекта
node build-www.js && npx cap sync android
cd android && ./gradlew bundleRelease
```

Готовый файл: `android/app/build/outputs/bundle/release/app-release.aab`.

Версия приложения берётся из `android/app/build.gradle`: `versionName` совпадает с `GAME_VERSION` в `js/config.js`, `versionCode` увеличивается на единицу при каждой загрузке в консоль.

**Ключ подписи** лежит вне репозитория: `D:\Users\Games\fruktolet-release\fruktolet-upload.jks`, пароль — в `keystore-password.txt` рядом. Потеряешь ключ — загрузить обновление тем же приложением будет нельзя (восстанавливается только через поддержку Google, если включено Play App Signing). Сделай копию в надёжном месте.
