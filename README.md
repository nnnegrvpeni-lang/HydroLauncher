# HydroLauncher

Чистый и минималистичный лаунчер Minecraft: **Java Edition** (vanilla / Fabric / Forge /
NeoForge / Quilt) и **Horizon** — нативный Rust-движок Minecraft.

## Технологии

- **Frontend:** React 19 + TypeScript + Tailwind CSS v4 + Zustand + Lucide Icons
- **Backend:** Tauri v2 (Rust, tokio, reqwest)
- **Хранилище:** JSON-файлы в папке данных пользователя (без БД)

## Структура проекта

```
hydro-launcher/
├── index.html                  # Точка входа Vite
├── src/                        # Frontend (React + TypeScript)
│   ├── api/                    # Типизированная обёртка над командами Tauri
│   │   ├── types.ts            # Все интерфейсы (Instance, Account, Java...)
│   │   └── events.ts           # Подписки на события запуска игры
│   ├── components/
│   │   ├── ui/                 # Базовые UI-компоненты (Button, Modal, ...)
│   │   ├── TitleBar.tsx        # Кастомная шапка окна (без системных рамок)
│   │   ├── Sidebar.tsx         # Навигация + активный аккаунт
│   │   └── InstanceBadge.tsx   # Бейдж движка сборки
│   ├── pages/
│   │   ├── HomePage.tsx        # Главная: приветствие, карточки сборок
│   │   ├── InstancesPage.tsx   # Управление сборками + создание
│   │   └── SettingsPage.tsx    # Аккаунты, Java, память, папка данных
│   ├── stores/                 # Состояние (Zustand)
│   ├── theme.css               # Дизайн-токены (тёмная/светлая темы)
│   └── utils/                  # Форматирование, cn()
│
├── src-tauri/                  # Backend (Rust)
│   └── src/
│       ├── config/endpoints.rs # Все URL API (Mojang, Adoptium) — без хардкода
│       ├── models/             # Сериализуемые структуры
│       ├── storage/
│       │   ├── paths.rs        # Все пути приложения — в одном месте
│       │   └── json_store.rs   # Атомарное чтение/запись JSON
│       ├── services/
│       │   ├── account_service.rs  # Офлайн-аккаунты (UUID v3 по стандарту)
│       │   ├── instance_service.rs # CRUD сборок
│       │   ├── settings_service.rs # Настройки + рекомендуемая память
│       │   ├── mojang_service.rs   # Скачивание клиента/ассетов/библиотек
│       │   ├── java_service.rs     # Поиск и автоустановка Java (Temurin)
│       │   ├── java_rules.rs       # Правила ОС для библиотек и аргументов
│       │   ├── downloader.rs       # Загрузка с проверкой SHA-1
│       │   └── launch_service.rs   # Сборка аргументов и запуск игры
│       ├── commands/           # Точка входа для фронтенда
│       └── state.rs            # Глобальное состояние Tauri
│
└── assets/icon.svg             # Исходник иконки
```

## Принципы разработки

1. **Никакого хардкода** — все URL, лимиты и дефолтные значения вынесены в
   `config/endpoints.rs`, пути — в `storage/paths.rs`, аргументы сборок — в сервисы.
2. **Чистый код** — каждый модуль отвечает за одну задачу, модели строго типизированы,
   ошибки описаны в едином `AppError` и уходят во фронтенд как текст.
3. **Атомарные записи** — любые JSON-файлы пишутся через временный файл + rename,
   чтобы не повредить данные при сбое.
4. **Валидация на бэкенде** — никнейм, память, пути проверяются в Rust, фронтенд
   только отображает результат.

## Запуск в разработке

```sh
npm install
npm run tauri dev
```

## Сборка релиза

```sh
npm run tauri build
```

## Статус (Этап 1 — MVP)

- [x] Каркас Tauri v2 + React + кастомный тайтлбар и темы
- [x] Офлайн-аккаунты (UUID по стандарту Bukkit `OfflinePlayer:<name>`)
- [x] Манифест Mojang с кэшем, список версий
- [x] Скачивание клиента, ассетов, библиотек, нативов с проверкой SHA-1
- [x] Автоопределение и автоустановка Java (Adoptium Temurin)
- [x] Запуск ванильного Minecraft с живыми логами и прогрессом
- [x] Изолированные сборки (instances/<id>/game)
- [ ] Этап 2: Fabric/Forge/NeoForge/Quilt + каталог Modrinth
- [ ] Этап 3: интеграция Horizon (Rust)
