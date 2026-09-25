/**
 * Demo data for eyeballing the apps: 8 fictional users, 10 published events
 * across 10 categories/cities, with registrations. Idempotent (upserts on
 * `demo-*` slugs and `*@demo.kiro.local` emails). Run AFTER the main seed:
 *   pnpm --filter @kiro/api exec ts-node prisma/seed-demo.ts
 * Remove with: DELETE FROM users WHERE email LIKE '%@demo.kiro.local'
 * (events + registrations cascade via owner/user deletes are NOT automatic
 * for events, so delete events with slug LIKE 'demo-%' first).
 */
import { PrismaClient, type RegistrationStatus } from "@prisma/client";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

const pic = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

const USERS = [
  { key: "olena", name: "Олена Коваленко", bio: "Люблю настолки та каву." },
  { key: "andriy", name: "Андрій Бондар", bio: "Організовую забіги та походи." },
  { key: "maria", name: "Марія Шевчук", bio: "Кулінарка, веду майстер-класи." },
  { key: "dmytro", name: "Дмитро Мельник", bio: "Музикант, грає по клубах." },
  { key: "iryna", name: "Ірина Ткачук", bio: "Мама двох, знаю всі дитячі заходи міста." },
  { key: "taras", name: "Тарас Гнатюк", bio: "Стендап, імпров, гарний настрій." },
  { key: "sofia", name: "Софія Лисенко", bio: "Нетворкінг і стартапи." },
  { key: "bohdan", name: "Богдан Романюк", bio: "Розробник, викладаю онлайн." },
];

interface EventSeed {
  slug: string;
  title: string;
  description: string;
  category: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  owner: string;
  daysAhead: number;
  hour: number;
  durationH: number;
  capacity: number | null;
  price?: number;
  approval?: boolean;
  online?: boolean;
  age?: number;
  going: string[];
}

const EVENTS: EventSeed[] = [
  {
    slug: "demo-board-games-night", title: "Вечір настолок у кав'ярні",
    description: "Catan, Каркассон, Dixit та ще 40 ігор. Приходьте самі або з друзями, ми допоможемо знайти компанію і навчимо правил. Кава й снеки за окрему плату.",
    category: "board-games", city: "kyiv", address: "вул. Хрещатик, 22", lat: 50.4474, lng: 30.5222,
    owner: "olena", daysAhead: 3, hour: 19, durationH: 4, capacity: 24, going: ["andriy", "maria", "taras", "sofia"],
  },
  {
    slug: "demo-morning-run", title: "Ранкова пробіжка над Дніпром",
    description: "Легкий забіг на 5 км у комфортному темпі, підходить початківцям. Збір біля пішохідного мосту, після пробіжки кава разом.",
    category: "sport", city: "kyiv", address: "Наводницький парк", lat: 50.4272, lng: 30.5468,
    owner: "andriy", daysAhead: 2, hour: 8, durationH: 2, capacity: 40, going: ["olena", "dmytro", "iryna", "bohdan", "sofia"],
  },
  {
    slug: "demo-jazz-concert", title: "Джазовий вечір просто неба",
    description: "Квартет виконає класику джазу та власні композиції. Приносьте пледи, столики поруч. Вхід за квитком, кількість місць обмежена.",
    category: "concerts", city: "lviv", address: "Площа Ринок, 1", lat: 49.8419, lng: 24.0315,
    owner: "dmytro", daysAhead: 6, hour: 20, durationH: 3, capacity: 120, price: 250, going: ["olena", "maria", "taras"],
  },
  {
    slug: "demo-standup-open-mic", title: "Стендап: відкритий мікрофон",
    description: "Десять коміків, по 7 хвилин кожен. Новий матеріал, живі реакції й багато сміху. Зал на 60 місць.",
    category: "standup", city: "kharkiv", address: "вул. Сумська, 45", lat: 49.9935, lng: 36.2304,
    owner: "taras", daysAhead: 5, hour: 19, durationH: 3, capacity: 60, price: 150, age: 18, going: ["andriy", "iryna", "bohdan"],
  },
  {
    slug: "demo-pasta-workshop", title: "Майстер-клас: домашня паста",
    description: "Разом приготуємо тальятелле та равіолі з нуля: тісто, начинка, соуси. Усі інгредієнти й фартухи надаємо. Дегустація наприкінці.",
    category: "workshops", city: "odesa", address: "вул. Дерибасівська, 10", lat: 46.4846, lng: 30.7326,
    owner: "maria", daysAhead: 8, hour: 17, durationH: 3, capacity: 12, price: 600, approval: true, going: ["sofia", "olena"],
  },
  {
    slug: "demo-street-food-fest", title: "Фестиваль вуличної їжі",
    description: "30 фудтраків, локальні крафтові напої, жива музика й дитяча зона. Вхід вільний, платите тільки за їжу.",
    category: "food-tasting", city: "dnipro", address: "Набережна Перемоги", lat: 48.4647, lng: 35.0462,
    owner: "maria", daysAhead: 10, hour: 12, durationH: 8, capacity: null, going: ["andriy", "dmytro", "taras", "iryna", "sofia", "bohdan"],
  },
  {
    slug: "demo-carpathian-hike", title: "Похід на Говерлу",
    description: "Одноденний підйом із гідом. Маршрут середньої складності, ~14 км. Потрібні трекінгове взуття, вода й дощовик. Трансфер від Ворохти.",
    category: "outdoor", city: "ivano-frankivsk", address: "Збір: залізничний вокзал", lat: 48.9226, lng: 24.7111,
    owner: "andriy", daysAhead: 14, hour: 6, durationH: 12, capacity: 15, price: 400, approval: true, going: ["olena", "bohdan", "sofia"],
  },
  {
    slug: "demo-startup-networking", title: "Нетворкінг для стартаперів",
    description: "Швидкі знайомства, три коротких пітчі від засновників та вільне спілкування. Візьміть візитки або просто гарний настрій.",
    category: "networking", city: "kyiv", address: "Creative Hub, вул. Ярославів Вал, 14", lat: 50.4487, lng: 30.5155,
    owner: "sofia", daysAhead: 4, hour: 18, durationH: 3, capacity: 50, going: ["bohdan", "dmytro", "olena", "taras"],
  },
  {
    slug: "demo-kids-science-show", title: "Науково-розважальне шоу для дітей",
    description: "Хімічні досліди, які безпечно повторити вдома, гігантські бульбашки та вулкан. Для дітей 5-10 років, батьки безкоштовно.",
    category: "kids", city: "lviv", address: "Центр «Львівський», вул. Городоцька, 30", lat: 49.8397, lng: 23.9912,
    owner: "iryna", daysAhead: 7, hour: 11, durationH: 2, capacity: 30, price: 120, going: ["maria", "olena"],
  },
  {
    slug: "demo-python-online", title: "Онлайн-лекція: Python для початківців",
    description: "Дві години практики: змінні, цикли, функції та перша власна програма. Потрібен лише ноутбук. Запис буде доступний учасникам.",
    category: "online", city: "kyiv", address: "Zoom (посилання надішлемо після реєстрації)", lat: 50.4501, lng: 30.5234,
    owner: "bohdan", daysAhead: 9, hour: 19, durationH: 2, capacity: null, online: true, going: ["sofia", "taras", "iryna", "dmytro"],
  },
];

async function main() {
  const passwordHash = await argon2.hash(randomBytes(24).toString("base64url"), { type: argon2.argon2id });

  const users: Record<string, string> = {};
  for (const [i, u] of USERS.entries()) {
    const email = `${u.key}@demo.kiro.local`;
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email, passwordHash, name: u.name, bio: u.bio,
        avatarUrl: pic(`kiro-avatar-${i + 1}`, 200, 200),
        emailVerifiedAt: new Date(), organizerActivatedAt: new Date(),
        preferences: { create: {} },
      },
      update: { name: u.name, bio: u.bio },
    });
    users[u.key] = user.id;
  }

  let created = 0;
  for (const [i, e] of EVENTS.entries()) {
    const category = await prisma.category.findUnique({ where: { slug: e.category } });
    const city = await prisma.city.findUnique({ where: { slug: e.city } });
    if (!category || !city) throw new Error(`Missing category ${e.category} or city ${e.city} — run the main seed first.`);

    const startsAt = new Date();
    startsAt.setUTCDate(startsAt.getUTCDate() + e.daysAhead);
    startsAt.setUTCHours(e.hour - 3, 0, 0, 0); // Europe/Kyiv ~ UTC+3
    const endsAt = new Date(startsAt.getTime() + e.durationH * 3600_000);

    const data = {
      ownerId: users[e.owner]!, title: e.title, description: e.description,
      categoryId: category.id, language: "uk", status: "PUBLISHED" as const, visibility: "PUBLIC" as const,
      format: e.online ? ("ONLINE" as const) : ("OFFLINE" as const),
      startsAt, endsAt, cityId: city.id, addressText: e.address, latitude: e.lat, longitude: e.lng,
      capacity: e.capacity, approvalMode: e.approval ? ("ORGANIZER_APPROVAL" as const) : ("AUTO" as const),
      ageRestriction: e.age ?? null,
      priceType: e.price ? ("PAID" as const) : ("FREE" as const), price: e.price ?? null,
      publishedAt: new Date(),
      onlineUrl: e.online ? "https://zoom.us/j/0000000000" : null,
    };

    const existing = await prisma.event.findUnique({ where: { slug: e.slug } });
    const event = existing
      ? await prisma.event.update({ where: { id: existing.id }, data })
      : await prisma.event.create({
          data: {
            ...data, slug: e.slug,
            media: {
              create: {
                type: "IMAGE", sortOrder: 0, width: 900, height: 1200,
                originalUrl: pic(`kiro-event-${i + 1}`, 900, 1200),
                displayUrl: pic(`kiro-event-${i + 1}`, 900, 1200),
                thumbnailUrl: pic(`kiro-event-${i + 1}`, 300, 400),
              },
            },
          },
        });
    if (!existing) created++;

    for (const [j, who] of e.going.entries()) {
      const status: RegistrationStatus = e.approval && j === e.going.length - 1 ? "PENDING" : e.price ? "CONFIRMED" : "REGISTERED";
      await prisma.registration.upsert({
        where: { eventId_userId: { eventId: event.id, userId: users[who]! } },
        create: { eventId: event.id, userId: users[who]!, status, showAsParticipant: true },
        update: {},
      });
    }
  }

  console.log(`[seed-demo] ${USERS.length} users, ${EVENTS.length} events (+${created} new).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
