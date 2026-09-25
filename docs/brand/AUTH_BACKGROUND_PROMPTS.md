# Фонові зображення для входу та реєстрації (Nano Banana)

Мета: щоб екран входу одразу передавав, що в Кіро весело. Обличчя не потрібні:
краще силуети, руки, предмети. Це дає більше свободи й не порушує чужих прав.

## Куди класти результат

- Сайт: `apps/web/public/auth-bg.jpg` (підхопиться автоматично, нічого міняти не треба).
- Застосунок: `apps/mobile/assets/auth-bg.jpg`, потім скажіть мені, і я підключу.
- Формат: вертикальний 9:16 (для телефона), 1080x1920 або більше. Розмір до 500 КБ,
  зробіть JPEG із якістю ~80.

## Промпт 1 (основний, вечірній)

```
Vertical 9:16 illustration for a mobile app login screen, energetic and joyful
evening-out mood. A dark deep-navy background with soft neon pink and violet
glow. Floating around the center, in a playful flat-3D style: confetti,
party streamers, a disco ball, board game dice and cards, a guitar, a skateboard,
a pizza slice, a camera, a concert ticket, balloons. Lots of colorful energy but a
calm, clean empty area in the middle third of the image (where a login form will
sit). No text, no logos, no people's faces, no watermark. Smooth gradients,
soft depth of field, high contrast, modern, friendly, premium look.
```

## Промпт 2 (денний, світла тема)

```
Vertical 9:16 illustration for a mobile app registration screen, bright and
cheerful daytime mood. Warm white and soft peach background with pastel pink and
lavender shapes. Playful flat-3D objects scattered around the edges: a bicycle,
a tennis racket, a paper coffee cup, a picnic blanket, headphones, a paint brush
and palette, a football, sunglasses, small flowers, confetti. A large clean empty
area in the middle third for a form. No text, no logos, no faces, no watermark.
Soft shadows, rounded shapes, fun and welcoming.
```

## Промпт 3 (люди без облич)

```
Vertical 9:16 photo-style illustration, friends having fun together seen from behind
or as silhouettes: raised hands with glowing drinks and confetti at a rooftop party,
warm sunset colors turning to violet and pink, string lights, laughing crowd
energy, shallow depth of field. No visible faces, no text, no logos. Dark lower
third for readability of white text and forms.
```

## Поради

- Додавайте `--ar 9:16`, якщо інструмент цього вимагає.
- Якщо форма погано читається на фоні, попросіть «lower contrast in the middle,
  dark vignette» або затемніть картинку у графічному редакторі.
- Перевірте, що на зображенні немає випадкового тексту й чужих логотипів.
