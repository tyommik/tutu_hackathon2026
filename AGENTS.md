<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## Git conventions

### Формат сообщения

- Conventional commits: `feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`, `perf`
- Язык — русский, начинай с инфинитива (`Добавить`, `Исправить` и т.п.)
- Не указывать соавторство (Co-Authored-By)
- Subject — одно предложение до 72 символов. Если нужна запятая или союз «и» — разбей на отдельные коммиты
    
### Body коммита

- Body отвечает на вопрос **«зачем»**, а не **«что»** — diff покажет «что» сам
- Не писать changelog-style списки изменённых файлов или модулей
- Допустимо: контекст проблемы, причина выбранного решения, что **не** сделано и почему
- `BREAKING CHANGE:` в footer, если ломается публичный API

### Один коммит = одно логическое изменение

- Правило действует **внутри фичеветки во время разработки**: каждый коммит атомарен
- Не смешивать в одном коммите: фичу + рефакторинг + правку багов + обновление примеров
- Тесты коммитить вместе с кодом, который они тестируют (один `feat` коммит), либо отдельным коммитом `test:` перед реализацией (TDD red phase)
- Зависимости (`uv.lock`, `pyproject.toml`) коммитить отдельно, если они не часть фичи
- При мёрже эти атомарные коммиты схлопываются в один (см. «Слияние со сквошем») — противоречия нет: атомарность нужна для ревью ветки, сквош — для чистой истории целевой ветки

### Слияние со сквошем
- Фичеветки вливаются в целевую ветку (`main` для независимых фич, `develop` для зависящих от core/front — см. «Ветвление») **только со сквошем** — одна задача = один коммит в целевой ветке
- Исключение: релизное слияние `develop` → `main` — обычный merge без сквоша (фичи в `develop` уже схлопнуты по одной; повторный сквош убил бы историю релиза)
- Итоговое сообщение **обязательно** переписать вручную: один заголовок `feat: ...` + описание с «зачем» по всей задаче
- Убирать автоматически добавленный `Co-authored-by`
- Итоговое сообщение должно следовать всем правилам выше (формат, привязка к задаче, описание)
- Локально без PR всегда делать слияние со сквошем явным сценарием:


### Публикация проекта
- Загрузка на сервер или vps делать только по запросу пользователя. Самостоятельно работать только на localhost.
