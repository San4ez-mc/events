// Same "TODO(tech debt)" note as event-types.ts applies here.

export interface Category {
  id: string;
  parentId: string | null;
  slug: string;
  nameUk: string;
  nameEn: string;
  icon: string | null;
  children: Category[];
}

export interface City {
  id: string;
  regionId: string;
  nameUk: string;
  nameEn: string;
  slug: string;
}

export interface District {
  id: string;
  cityId: string;
  nameUk: string;
  nameEn: string | null;
}
