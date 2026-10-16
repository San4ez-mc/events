import type { Metadata } from "next";
import { AfishaPage, afishaMetadata } from "@/components/afisha-page";

/** "Афіша <місто>": a plain, server-rendered, indexable list of upcoming events (hourly refresh via the fetch cache). */
export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city } = await params;
  return afishaMetadata(city, null);
}

export default async function CityAfishaPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  return <AfishaPage citySlug={city} filterSlug={null} />;
}
