import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  titleRight?: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function DashboardSection({
  title,
  subtitle,
  titleRight,
  children,
  className,
}: Props) {
  const sectionClass = ["dashboardSection", className].filter(Boolean).join(" ");

  return (
    <section className={sectionClass}>
      <div className="dashboardSectionHeader">
        <div className="dashboardSectionTitleRow">
          <h2>{title}</h2>
          {titleRight}
        </div>
        {subtitle ? <p className="dashboardSectionSub">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}
