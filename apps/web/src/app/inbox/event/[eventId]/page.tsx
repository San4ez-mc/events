"use client";

import { useParams } from "next/navigation";
import { InquiryView } from "@/components/inbox/inquiry-view";

export default function InboxEventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  return <InquiryView eventId={eventId} />;
}
