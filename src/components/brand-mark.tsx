import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="64" height="64" rx="15" fill="#18D6A2" />
      <path
        d="M20 48V16h15.5C44 16 49 21 49 28.5S44 41 35.5 41H27"
        fill="none"
        stroke="#0C2139"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M27 25h9c3.5 0 5.5 1.3 5.5 3.8s-2 4.2-5.5 4.2h-9"
        fill="none"
        stroke="#F7FFFC"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M14 47.5h7M14 40.5h7"
        stroke="#0C2139"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
