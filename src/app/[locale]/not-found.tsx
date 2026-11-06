import { LogoMark } from "@/components/logo";
import { ButtonLink } from "@/components/ui";
import en from "@/lib/messages/en";

export default function LocaleNotFound() {
  const m = en;
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <LogoMark className="h-14 w-14" />
      <h1 className="mt-6 text-3xl font-bold tracking-tight">
        {m.common.notFoundTitle}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
        {m.common.notFoundBody}
      </p>
      <ButtonLink href="/en" className="mt-8" size="lg">
        {m.common.backHome}
      </ButtonLink>
    </div>
  );
}
