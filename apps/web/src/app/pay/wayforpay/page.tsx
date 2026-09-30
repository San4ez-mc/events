"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

const PAY_URL = "https://secure.wayforpay.com/pay";
// The exact field set WayForPayAdapter.createCheckout signs and sends — passed through unchanged
// as query params by the backend, then POSTed here (their /pay endpoint rejects GET with "Bad
// Request — This page requires only POST data", so this page exists purely to convert the GET
// navigation any client can do into the POST WayForPay actually requires).
const FIELDS = [
  "merchantAccount",
  "merchantDomainName",
  "merchantSignature",
  "orderReference",
  "orderDate",
  "amount",
  "currency",
  "productName[]",
  "productCount[]",
  "productPrice[]",
];

function AutoSubmitForm() {
  const params = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.submit();
  }, []);

  return (
    <form ref={formRef} method="POST" action={PAY_URL} style={{ display: "none" }}>
      {FIELDS.map((name) => (
        <input key={name} type="hidden" name={name} value={params.get(name) ?? ""} />
      ))}
    </form>
  );
}

export default function WayForPayRedirectPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm text-muted">Перенаправляємо на сторінку оплати…</p>
      <Suspense fallback={null}>
        <AutoSubmitForm />
      </Suspense>
    </div>
  );
}
