/**
 * QA fixtures — seeded once via a Node script against the API directly
 * (apps/api/test/spec-gaps.e2e-spec.ts patterns: register -> claim-free ->
 * create -> patch -> publish). Accounts use the `qa-ui-` email prefix.
 *
 * Regenerate by re-running the seeding script if the local Postgres/API is
 * reset. See docs/qa/QA_ui.md for how these were produced.
 */
export const QA = {
  admin: {
    email: "qa-ui-admin-1790492919833-56619@example.com",
    password: "Str0ngPass1",
  },
  organizer: {
    email: "qa-ui-organizer-1790492938905-94429@example.com",
    password: "Str0ngPass1",
  },
  userA: {
    email: "qa-ui-userA-1790492960833-21179@example.com",
    password: "Str0ngPass1",
  },
  publicEventSlugs: [
    "qa-ui-public-event-1-5djccm",
    "qa-ui-public-event-2-gya0wi",
    "qa-ui-public-event-3-s37ug1",
    "qa-ui-public-event-4-748qo1",
    "qa-ui-public-event-5-301wbh",
    "qa-ui-public-event-6-g0q7oq",
    "qa-ui-public-event-7-ou6yfl",
    "qa-ui-public-event-8-oufwip",
    "qa-ui-public-event-9-wd17jj",
    "qa-ui-public-event-10-go7pkp",
    "qa-ui-public-event-11-vfrlzx",
    "qa-ui-public-event-12-ad1fnp",
    "qa-ui-public-event-13-3rjwuo",
    "qa-ui-public-event-14-xrxt3l",
    "qa-ui-public-event-15-y62bu7",
    "qa-ui-public-event-16-45q9vz",
    "qa-ui-public-event-17-bwji5p",
    "qa-ui-public-event-18-aw11n5",
    "qa-ui-public-event-19-uaok8q",
    "qa-ui-public-event-20-0zuaih",
  ],
  privateEventSlug: "qa-ui-private-event-0tpg6u",
};

export const firstPublicSlug = QA.publicEventSlugs[0]!;
