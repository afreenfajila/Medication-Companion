import Link from "next/link";
import { PhoneShell, ScreenBody } from "@/components/ui/shell";

export default function NotFound() {
  return (
    <div className="min-h-dvh bg-canvas md:flex md:items-center md:justify-center md:bg-desk md:px-4 md:py-6">
      <PhoneShell>
        <ScreenBody className="justify-center gap-5 pt-8 text-center">
          <h1 className="text-[28px] font-bold leading-tight">We couldn’t find that page.</h1>
          <p className="text-lg leading-normal">Let’s go back to the start.</p>
          <Link
            href="/"
            className="inline-flex min-h-14 items-center justify-center rounded-pill bg-navy-900 px-6 text-lg font-bold text-white"
          >
            Back to the start
          </Link>
        </ScreenBody>
      </PhoneShell>
    </div>
  );
}
