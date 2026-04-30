# Remotion — видео-карточки Das Experten

Прототип автогенерации рекламных роликов для маркетплейсов через
[Remotion](https://www.remotion.dev/) (React → mp4).

## Что внутри

- `src/Root.tsx` — реестр композиций (видео-шаблонов)
- `src/compositions/ProductCard.tsx` — шаблон вертикальной карточки
  товара (1080×1920, 6 секунд, 30 fps): логотип → название → tagline →
  буллеты выгод → CTA «Купить на Ozon»

## Как посмотреть результат — без терминала

1. Открой репо на github.com → вкладка **Actions**.
2. Слева выбери workflow **Render Remotion Video**.
3. Кнопка **Run workflow** (справа сверху) → ввести SKU/название/tagline
   (или оставить дефолты — `DE201 SCHWARZ`) → жми **Run**.
4. Через ~3 минуты в логе появится артефакт `product-card-mp4` —
   качаешь zip, внутри готовый mp4.

## Как поменять текст/цвета

Открой `src/Root.tsx`, поправь `defaultProps` — сохрани, закоммить.
Следующий рендер уже с новым текстом. Можно также передавать параметры
прямо в Actions через поля `Run workflow`.

## Как добавить второй товар

Скопируй блок `<Composition id="ProductCard" .../>` в `Root.tsx`,
поменяй `id` (например `ProductCardSymbios`) и подставь свои
`defaultProps`. Запускай рендер с новым `composition_id`.

## Локальный запуск (опционально, для разработчика)

```bash
cd remotion
npm install
npm start          # studio с предпросмотром на localhost:3000
npm run render     # один mp4 в out/product-card.mp4
```
