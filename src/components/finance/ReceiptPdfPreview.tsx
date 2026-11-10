"use client";
import PrivatePdfPreview from "@/components/documents/PrivatePdfPreview";
export default function ReceiptPdfPreview({
  url,
  label = "Receipt",
}: {
  url: string;
  label?: string;
}) {
  return <PrivatePdfPreview url={url} label={label} />;
}
