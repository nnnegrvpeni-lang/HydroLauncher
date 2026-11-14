# HydroLauncher — Руководство для разработки (AGENTS.md)

## Стек и архитектура
- **Desktop shell**: Tauri v2 (`src-tauri/`) + React 19 + TypeScript + Vite + Tailwind CSS v4 (`src/`).
- **Аккаунты**: только офлайн (`OfflinePlayer:<name>` UUID v3).
- **Движки**: Java Edition (Vanilla, Fabric, Forge, NeoForge, Quilt) + нативный движок Horizon (Rust).

## Критические правила
1. **Никаких хардкодных URL, путей и личных данных**:
   - Все внешние URL централизованы в `src-tauri/src/config/endpoints.rs`.
   - Все пути хранения централизованы в `src-tauri/src/storage/paths.rs`.
   - Даже в `src/api/mock.ts` не использовать реальные имена пользователей или локальные пути разработчика.
2. **Визуальный стиль (Жидкое стекло)**:
   - Приглушённая палитра (`#121618` / `#1a2123`, акцент `#b4cdb0`) и фон `WorldBackdrop` (`.hl-world`) со стеклянными панелями `.deck-surface`.
   - Без неона, без SaaS-пилюлек (`• В игре`, `• Готова`), без рамочек вокруг каждой цифры/версии, без мигающих точек-индикаторов, без шаблонных SVG-заглушек и без сдвигов макета при переключении вкладок/фильтров.
   - Уведомления о прогрессе и ошибках — через `ToastHost.tsx` (правый верхний угол), без смещения контента.
   - Шрифты: локальные `IBM Plex Sans` и `IBM Plex Mono` из `public/fonts/`.
   - В `vite.config.ts` папка `public/fonts/**` добавлена в `server.watch.ignored` (защита от `EBUSY` на Windows).
3. **Запуск Minecraft (`src-tauri/src/services/mojang_service.rs`, `java_rules.rs`, `launch_service.rs`)**:
   - `collect_classpath` обязан включать и библиотеки `details.libraries`, и `versions/<id>/<id>.jar`.
   - `rule_allows` в `java_rules.rs` обязан учитывать `rule.features`: опциональные фичи (`is_demo_user`, `has_custom_resolution`, `is_quick_play_*`) выключены, поэтому правила с `features: { ...: true }` не должны применяться.
   - `VersionSummary` в Rust сериализует `version_type` как `"type"`, поэтому в TS (`src/api/types.ts`) поле называется `type`.
4. **Консоль и буфер обмена**:
   - В `theme.css` на `body` стоит `user-select: none`, поэтому все области с логами обязаны иметь `select-text cursor-text` и кнопку копирования.
5. **Обязательная проверка после правок**:
   - Не удалять импорт и его использование отдельными `edit`-вызовами в одном файле, чтобы Vite HMR не застревал на сломанном промежуточном состоянии.
   - Фронтенд: `npx tsc -b` и `npm run build`.
   - Бэкенд: `cargo check --manifest-path src-tauri/Cargo.toml` и `cargo test --manifest-path src-tauri/Cargo.toml`.
   - Визуал и runtime: проверка в headless Edge / `tools.browser` (`errors: []` на `#home` и `#instances`).
