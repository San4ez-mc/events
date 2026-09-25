import type {
  ApprovalMode,
  EventFormat,
  EventPriceType,
  EventVisibility,
  RegistrationFieldType,
} from "@kiro/types";

/** A custom registration question as edited in the wizard (options are a comma-separated string). */
export interface WizardField {
  id?: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  options: string;
}

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
  visibility: EventVisibility;
  registrationDeadline: string; // datetime-local value
  adultsOnly: boolean;
  rules: string;
  paymentUrl: string;
  fields: WizardField[];
  faq: { question: string; answer: string }[];
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
  visibility: "PUBLIC",
  registrationDeadline: "",
  adultsOnly: false,
  rules: "",
  paymentUrl: "",
  fields: [],
  faq: [],
};

export interface StepProps {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
}
