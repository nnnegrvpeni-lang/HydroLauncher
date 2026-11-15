/**
 * Английские переводы. Ключ — точная русская фраза из интерфейса.
 * Если фразы нет в словаре, показывается русский вариант.
 */
export const en: Record<string, string> = {
  // Общее
  Отмена: 'Cancel',
  Удалить: 'Delete',
  'Удалить навсегда': 'Delete permanently',
  Закрыть: 'Close',
  Открыть: 'Open',
  'Открыть папку': 'Open folder',
  Изменить: 'Change',
  Очистить: 'Clean up',
  Сохранить: 'Save',
  Назад: 'Back',
  Показать: 'Show',
  Скрыть: 'Hide',
  Загрузка: 'Loading',
  Ошибка: 'Error',
  'Разделы': 'Sections',

  // Навигация
  Обзор: 'Overview',
  Сборки: 'Instances',
  Моды: 'Mods',
  Настройки: 'Settings',
  Профиль: 'Profile',
  'Офлайн-профили': 'Offline profiles',
  'Профилей пока нет': 'No profiles yet',
  'Добавить профиль': 'Add profile',
  'Удалить профиль': 'Delete profile',
  'Удалить профиль?': 'Delete profile?',
  'Профиль будет удалён из списка лаунчера. Миры и файлы сборок останутся на месте.':
    'The profile will be removed from the launcher list. Worlds and instance files stay on disk.',
  Свернуть: 'Minimize',
  Развернуть: 'Maximize',
  'доступно {version}': 'available {version}',
  'HydroLauncher {version} — открыть страницу релиза':
    'HydroLauncher {version} — open the release page',

  // Настройки
  'Профили игроков, тема оформления, память и файлы лаунчера':
    'Player profiles, appearance, memory and launcher files',
  'Профили и вид': 'Profiles & appearance',
  'Память и запуск': 'Memory & launch',
  Хранилище: 'Storage',
  'Локальные профили без внешней авторизации': 'Local profiles without external sign-in',
  Добавить: 'Add',
  'Нет созданных профилей.': 'No profiles yet.',
  '· текущий': '· current',
  Выбрать: 'Select',
  Оформление: 'Appearance',
  'Тема поверхности окна и мира на фоне': 'Window surface theme and background world',
  'Цветовая тема': 'Color theme',
  Сумерки: 'Dusk',
  Ночь: 'Night',
  День: 'Day',
  'Язык интерфейса': 'Interface language',
  'Переключается сразу, без перезапуска': 'Applies instantly, no restart needed',
  'Параметры по умолчанию для сборок без собственного лимита':
    'Defaults for instances without their own limit',
  'Память по умолчанию': 'Default memory',
  'Сворачивать лаунчер при запуске игры': 'Minimize launcher when the game starts',
  'Окно свернётся в панель задач и вернётся после выхода из игры':
    'The window minimizes to the taskbar and returns when the game exits',
  'Сворачивать в трей при закрытии': 'Minimize to tray on close',
  'Крестик скрывает окно, лаунчер остаётся в трее. Выход — через меню трея':
    'The close button hides the window; the launcher stays in the tray. Exit from the tray menu.',
  'Показывать снапшоты при создании сборки': 'Show snapshots when creating an instance',
  'Включает тестовые версии в каталог выбора': 'Includes test versions in the version picker',
  'Показывать снапшоты': 'Show snapshots',
  'Поиск установленных JVM и загрузка Eclipse Temurin':
    'Find installed JVMs and download Eclipse Temurin',
  'Найти на ПК': 'Scan this PC',
  'Системная Java не найдена — можно установить ниже.':
    'No system Java found — you can install one below.',
  управляемая: 'managed',
  'Быстрая установка Temurin': 'Quick Temurin install',
  'Дополнительные пути к java.exe (по одному в строке)':
    'Extra paths to java.exe (one per line)',
  'Корневая папка со сборками, ассетами и профилями':
    'Root folder for instances, assets and profiles',
  'Кэш движка Horizon': 'Horizon engine cache',
  'Удаляет бинарники и подготовленные ресурсы версий, которые не использует ни одна сборка':
    'Removes binaries and prepared resources for engine versions no instance uses',
  'О программе': 'About',
  'Версия лаунчера и доступные обновления': 'Launcher version and available updates',
  'проверка обновлений…': 'checking for updates…',
  'Открыть страницу релиза': 'Open the release page',
  'Доступна версия {version}': 'Version {version} is available',
  'Обновление {version} скрыто': 'Update {version} is hidden',
  'Очищено {size} кэша Horizon': 'Freed {size} of Horizon cache',
  'Нечего удалять: все версии Horizon используются сборками':
    'Nothing to remove: all Horizon versions are used by instances',

  // Сборки
  'Изолированные профили игры с отдельными мирами, модами и параметрами':
    'Isolated game profiles with their own worlds, mods and settings',
  'Создать сборку': 'Create instance',
  Все: 'All',
  'Поиск сборки…': 'Search instances…',
  'Сборок пока нет': 'No instances yet',
  'Создайте первую сборку: выберите версию Minecraft и модлоадер.':
    'Create your first instance: pick a Minecraft version and a mod loader.',
  'Ничего не найдено': 'Nothing found',
  'Попробуйте сбросить фильтр или изменить запрос.':
    'Try clearing the filter or changing the query.',
  Запущена: 'Running',
  'Параметры сборки': 'Instance settings',
  'Дублировать сборку вместе с модами и мирами':
    'Duplicate the instance with mods and worlds',
  'Экспортировать сборку в .mrpack': 'Export the instance as .mrpack',
  'Экспорт .mrpack доступен только для Java Edition':
    '.mrpack export is available for Java Edition only',
  'Удалить сборку': 'Delete instance',
  'Запустить сборку': 'Launch instance',
  'Сначала добавьте профиль': 'Add a profile first',
  Запуск: 'Launching',
  Играть: 'Play',
  Стоп: 'Stop',
  'Удалить сборку?': 'Delete instance?',
  'Папка сборки, миры, моды и конфигурации будут удалены без возможности восстановления.':
    'The instance folder, worlds, mods and configs will be deleted permanently.',
  'Создана копия «{name}»': 'Created a copy: “{name}”',
  'Сборка экспортирована: {path}': 'Instance exported: {path}',

  // Главная
  'Добро пожаловать в HydroLauncher': 'Welcome to HydroLauncher',
  'Чистый лаунчер для Java Edition и нативного движка Horizon (Rust) с офлайн-профилями и встроенным каталогом модов.':
    'A clean launcher for Java Edition and the native Horizon engine (Rust), with offline profiles and a built-in mod catalog.',
  '1. Профиль': '1. Profile',
  '2. Сборка': '2. Instance',
  '3. Запуск': '3. Launch',
  'Активный ник:': 'Active nickname:',
  'Можно добавить ещё в меню сверху.': 'You can add more in the top menu.',
  'Укажите офлайн-никнейм — он нужен для запуска игры и сохранений.':
    'Set an offline nickname — it is required to launch the game and save progress.',
  'Создайте сборку с Vanilla, Fabric, Forge, NeoForge, Quilt, Horizon или импортируйте':
    'Create an instance with Vanilla, Fabric, Forge, NeoForge, Quilt, Horizon or import',
  'Лаунчер сам найдёт или скачает нужную Java, загрузит библиотеки, ассеты и запустит клиент.':
    'The launcher finds or downloads the right Java, fetches libraries and assets, and starts the client.',
  'Создать профиль': 'Create profile',
  'Каталог модов': 'Mod catalog',

  // Миры и моды сборки
  Миры: 'Worlds',
  'Загрузка миров…': 'Loading worlds…',
  'Миров пока нет': 'No worlds yet',
  'Создайте мир в игре — он появится здесь. Резервные копии сохраняются в':
    'Create a world in game and it will appear here. Backups are stored in',
  'Создать резервную копию': 'Create a backup',
  'Удалить мир': 'Delete world',
  'Резервная копия мира создана: {file}': 'World backup created: {file}',
  Шейдеры: 'Shaders',
  Ресурспаки: 'Resource packs',
  Скриншоты: 'Screenshots',
  Логи: 'Logs',
  'Загрузка скриншотов…': 'Loading screenshots…',
  'Скриншотов пока нет': 'No screenshots yet',
  'Нажмите F2 в игре — снимки появятся здесь из папки':
    'Press F2 in game — screenshots from this folder will appear here',
  'Предпросмотр недоступен': 'Preview unavailable',
  'Консоль сборки': 'Instance console',
  'Установить моды': 'Install mods',

  // Отчёт о краше
  'Игра завершилась с ошибкой': 'The game crashed',
  Сборка: 'Instance',
  'Код завершения': 'Exit code',
  Время: 'Time',
  'Частые причины: несовместимый мод, нехватка памяти или устаревшая Java. Скопируйте отчёт и приложите его к обращению — там есть версия сборки и хвост лога.':
    'Common causes: an incompatible mod, too little memory, or an outdated Java. Copy the report and attach it to your request — it contains the instance version and the log tail.',
  'Последние строки лога': 'Last log lines',
  'Лог пуст': 'Log is empty',
  'Скопировать отчёт': 'Copy report',
  'Отчёт скопирован в буфер обмена': 'Report copied to clipboard',
  'Не удалось скопировать отчёт': 'Failed to copy the report',

  // Главная: быстрый запуск и док
  'Войти на {address}': 'Join {address}',
  'Удалить сервер': 'Remove server',
  'Войти в мир «{name}»': 'Open world “{name}”',
  Мир: 'World',
  'Название (необязательно)': 'Name (optional)',
  Ок: 'OK',
  'Добавить сервер': 'Add server',
  'Уменьшить на 512 MB': 'Decrease by 512 MB',
  'Увеличить на 512 MB': 'Increase by 512 MB',
  Остановить: 'Stop',
  'Сначала создайте профиль': 'Create a profile first',
  'Загрузка…': 'Loading…',
  'Запуск…': 'Launching…',
  Параметры: 'Settings',
  Консоль: 'Console',
  'Док сборок': 'Instance dock',
  '· запущена': '· running',
  'Показать все сборки (ещё {count})': 'Show all instances ({count} more)',
  'Новая сборка': 'New instance',
  'Консоль процесса': 'Process console',
  Скопировано: 'Copied',
  Копировать: 'Copy',
  'Закрыть консоль': 'Close console',
  'Консоль пуста — после запуска здесь появится вывод Minecraft.':
    'The console is empty — Minecraft output will appear here after launch.',

  // Каталог модов
  Каталог: 'Catalog',
  '{count} проектов': '{count} projects',
  'Установка в {name}': 'Installing into {name}',
  'Отвязать от сборки': 'Detach from instance',
  'Поиск модов и шейдеров Horizon (AE2, Zoom, Atlas)…':
    'Search Horizon mods and shaders (AE2, Zoom, Atlas)…',
  'Поиск модов на Modrinth (Sodium, Iris, JEI)…':
    'Search Modrinth mods (Sodium, Iris, JEI)…',
  'Все версии': 'All versions',
  'Все типы': 'All types',
  'Нативные (.hnmod)': 'Native (.hnmod)',
  'Контент (.hmod)': 'Content (.hmod)',
  'Любой загрузчик': 'Any loader',
  Оптимизация: 'Optimization',
  Утилиты: 'Utilities',
  Технологии: 'Technology',
  Магия: 'Magic',
  Декор: 'Decoration',
  Библиотеки: 'Libraries',
  'Загрузка каталога Modrinth…': 'Loading the Modrinth catalog…',
  'Попробуйте изменить поисковый запрос, загрузчик или категорию':
    'Try changing the query, loader or category',
  'Страница {page} из {total}': 'Page {page} of {total}',
  'Вперёд': 'Next',
  'Установка…': 'Installing…',
  Установлен: 'Installed',
  Установить: 'Install',
  'Установлен в {name}': 'Installed in {name}',
  'Установить в {name}': 'Install into {name}',
  'Назад к каталогу': 'Back to catalog',
  'от {author}': 'by {author}',
  'Открыть на {source}': 'Open on {source}',
  'Несовместима': 'Incompatible',
  'Только для Horizon (Rust)': 'Horizon (Rust) only',
  'Только для Java Edition': 'Java Edition only',
  'Vanilla не поддерживает моды': 'Vanilla does not support mods',

  // Управление модами сборки
  модов: 'mods',
  шейдеров: 'shaders',
  ресурспаков: 'resource packs',
  'Эта сборка использует Vanilla и не загружает моды. Для установки модов создайте сборку с Fabric, Forge, NeoForge или Quilt.':
    'This instance uses Vanilla and does not load mods. Create an instance with Fabric, Forge, NeoForge or Quilt to install mods.',
  'Найдено обновлений: {count}. Нажмите «Обновить» рядом с модом.':
    'Updates found: {count}. Press “Update” next to a mod.',
  'Все распознанные моды Modrinth актуальны.':
    'All recognized Modrinth mods are up to date.',
  'К списку модов': 'Back to mods',
  'Загрузка версий с Modrinth…': 'Loading versions from Modrinth…',
  'Загрузка и распознавание…': 'Loading and recognizing…',
  'Включить мод': 'Enable mod',
  'Отключить мод': 'Disable mod',
  'Обновить до {version}': 'Update to {version}',
  Версия: 'Version',
  'Удалить мод': 'Remove mod',
  'В сборке «{name}» пока нет {label}': 'Instance “{name}” has no {label} yet',
  'Нажмите «Открыть каталог», чтобы скачать их из {source} в один клик':
    'Press “Open catalog” to download them from {source} in one click',
  'Открыть каталог': 'Open catalog',
  Текущая: 'Current',
  'Внимание по .hnmod:': 'Note about .hnmod:',
  'нативные моды сохранены в': 'native mods are saved to',
  ', но готовый клиент Horizon Nightly не загружает их без пересборки движка из исходников Rust. Контент-моды (':
    ', but the ready-made Horizon Nightly client does not load them without rebuilding the engine from Rust sources. Content mods (',
  '), шейдеры и ресурспаки работают сразу.':
    '), shaders and resource packs work out of the box.',
  'выкл.': 'off',
  '{count} модов': '{count} mods',
  'Переименовать сборку': 'Rename instance',
  'Контент-моды (.hmod)': 'Content mods (.hmod)',
  'Скрыть инструкцию': 'Hide instructions',
  'Как запустить .hnmod?': 'How to run .hnmod?',
  'требует пересборки (.hnmod)': 'requires a rebuild (.hnmod)',
  'Установить «{name}»': 'Install “{name}”',
  'Версия {version} · выберите совместимую сборку':
    'Version {version} · choose a compatible instance',
  'Выберите сборку, совместимую с этим модом':
    'Choose an instance compatible with this mod',

  // Создание сборки
  'Кастомная конфигурация, модпак Modrinth или импорт .mrpack':
    'Custom setup, Modrinth modpack or .mrpack import',
  Кастомная: 'Custom',
  'Импорт .mrpack': '.mrpack import',
  Создать: 'Create',
  'Импорт…': 'Importing…',
  Импортировать: 'Import',
  Название: 'Name',
  'Например, Survival 26.3': 'For example, Survival 26.3',
  Движок: 'Engine',
  'Нативный движок Horizon (Rust)': 'Native Horizon engine (Rust)',
  'Запускается нативно без JVM. После создания сборки лаунчер скачает бинарники Horizon с GitHub и подготовит ресурсы официального клиента 26.3.':
    'Runs natively without a JVM. After creating the instance the launcher downloads Horizon binaries from GitHub and prepares the official 26.3 client resources.',
  'Версия бинарников Horizon': 'Horizon binaries version',
  'Загрузка релизов Horizon…': 'Loading Horizon releases…',
  'Авто (последний nightly)': 'Auto (latest nightly)',
  'Модлоадер': 'Mod loader',
  'Версия модлоадера': 'Mod loader version',
  Проверка: 'Checking',
  'Проверка…': 'Checking…',
  Недоступно: 'Unavailable',
  'Загрузка версий лоадера…': 'Loading loader versions…',
  'Нет версий для {version}': 'No versions for {version}',
  'Авто ({version})': 'Auto ({version})',
  'Авто (последняя: {version})': 'Auto (latest: {version})',
  'Версия Minecraft ({count})': 'Minecraft version ({count})',
  'проверка…': 'checking…',
  'Загрузка версий…': 'Loading versions…',
  'Поиск версии…': 'Search versions…',
  'Загружаем каталог версий Mojang…': 'Loading the Mojang version catalog…',
  'Подходящих версий не найдено.': 'No matching versions found.',
  Релиз: 'Release',
  Снапшот: 'Snapshot',
  'Поиск сборок на Modrinth (например, Fabulously Optimized)…':
    'Search Modrinth modpacks (for example, Fabulously Optimized)…',
  'Поиск модпаков Modrinth…': 'Searching Modrinth modpacks…',
  'Модпаки не найдены': 'No modpacks found',
  '{count} скачиваний': '{count} downloads',
  'Файл модпака (.mrpack)': 'Modpack file (.mrpack)',
  'Выберите .mrpack файл…': 'Choose a .mrpack file…',
  'Обзор…': 'Browse…',
  'Название сборки (необязательно)': 'Instance name (optional)',
  'По умолчанию из modrinth.index.json': 'Defaults to modrinth.index.json',
  'Лаунчер распакует overrides, определит версию Minecraft и модлоадер, и скачает все моды из манифеста сборки.':
    'The launcher unpacks overrides, detects the Minecraft version and mod loader, and downloads all mods from the pack manifest.',
  'Для Minecraft {version} нет сборок этого модлоадера. Выберите другой лоадер или версию игры.':
    'There are no builds of this mod loader for Minecraft {version}. Pick another loader or game version.',
  'Доступно: {count}': 'Available: {count}',

  // Профили
  'Новый офлайн-профиль': 'New offline profile',
  'Никнейм от 3 до 16 символов: латиница, цифры или _':
    'Nickname of 3–16 characters: letters, digits or _',
  'Никнейм игрока': 'Player nickname',
  'Например, Steve': 'For example, Steve',

  // Параметры сборки
  'Название сборки': 'Instance name',
  'Эта сборка работает на нативном движке': 'This instance runs on the native',
  '. Лимиты памяти JVM, путь к Java и JVM-аргументы не используются.':
    ' engine. JVM memory limits, the Java path and JVM arguments are not used.',
  'Установлено: {tag}': 'Installed: {tag}',
  'Не установлено — бинарники скачаются при первом запуске':
    'Not installed — binaries will be downloaded on first launch',
  'Автообновление Horizon (Rust)': 'Horizon auto-update (Rust)',
  'Фиксированная версия — автообновление отключено':
    'Pinned version — auto-update disabled',
  'Скачивать свежий nightly-билд при запуске сборки':
    'Download the latest nightly build when launching the instance',
  'Свой лимит памяти (RAM)': 'Custom memory limit (RAM)',
  'По умолчанию: {memory}': 'Default: {memory}',
  'Свой лимит памяти': 'Custom memory limit',
  Выделено: 'Allocated',
  'Путь к Java (необязательно)': 'Java path (optional)',
  'Автоматический выбор': 'Automatic selection',
  'Аргументы JVM (через пробел)': 'JVM arguments (space-separated)',
  'Версия модлоадера ({loader})': 'Mod loader version ({loader})',
  'Авто (последняя стабильная)': 'Auto (latest stable)',

  // Карточка мода
  'Описание не предоставлено автором.': 'No description provided by the author.',
  Скачиваний: 'Downloads',
  Подписчиков: 'Followers',
  Загрузчики: 'Loaders',
  Описание: 'Description',
  Версии: 'Versions',
  Галерея: 'Gallery',
  'Совместимых версий не найдено': 'No compatible versions found',
  'Совместимые сборки': 'Compatible instances',
  Несовместимые: 'Incompatible',
  Установлено: 'Installed',
};
