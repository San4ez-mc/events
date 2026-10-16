import type { Metadata } from "next";
import { AfishaPage, afishaMetadata } from "@/components/afisha-page";

/** "Афіша <місто> — вихідні / сьогодні / безкоштовні / <категорія>". */
export async function generateMetadata({ params }: { params: Promise<{ city: string; filter: string }> }): Promise<Metadata> {
  const { city, filter } = await params;
  return afishaMetadata(city, filter);
}

export default async function CityAfishaFilterPage({ params }: { params: Promise<{ city: string; filter: string }> }) {
  const { city, filter } = await params;
  return <AfishaPage citySlug={city} filterSlug={filter} />;
}
