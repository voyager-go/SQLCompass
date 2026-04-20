import type { PropsWithChildren } from "react";

type SectionCardProps = PropsWithChildren<{
    eyebrow: string;
    title: string;
    description: string;
}>;

export function SectionCard({ eyebrow, title, description, children }: SectionCardProps) {
    return (
        <section className="section-card">
            <header className="section-card__header">
                <p className="eyebrow">{eyebrow}</p>
                <h2>{title}</h2>
                <p>{description}</p>
            </header>
            {children}
        </section>
    );
}
