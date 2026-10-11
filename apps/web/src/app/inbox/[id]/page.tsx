"use client";

import { useParams } from "next/navigation";
import { InquiryView } from "@/components/inbox/inquiry-view";

export default function InboxThreadPage() {
  const { id } = useParams<{ id: string }>();
  return <InquiryView inquiryId={id} />;
}
