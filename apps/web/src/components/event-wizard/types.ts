import type { ApprovalMode, EventFormat, EventPriceType } from "@kiro/types";

/** Local wizard state — a subset of EventDetail the steps actually edit. */
export interface WizardData {
  title: string;
  description: string;
  categoryId: string | null;
  format: EventFormat;
  startsAt: string; // datetime-local input value, "" if unset
  endsAt: string;
  cityId: string | null;
  districtId: string | null;
  addressText: string;
  googlePlaceId: string | null;
  latitude: number | null;
  longitude: number | null;
  onlineUrl: string;
  priceType: EventPriceType;
  price: string;
  capacity: string;
  minParticipants: string;
  approvalMode: ApprovalMode;
}

export const EMPTY_WIZARD_DATA: WizardData = {
  title: "",
  description: "",
  categoryId: null,
  format: "OFFLINE",
  startsAt: "",
  endsAt: "",
  cityId: null,
  districtId: null,
  addressText: "",
  googlePlaceId: null,
  latitude: null,
  longitude: null,
  onlineUrl: "",
  priceType: "FREE",
  price: "",
  capacity: "",
  minParticipants: "",
  approvalMode: "AUTO",
};

export interface StepProps {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
}
