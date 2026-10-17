import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/admin/PageHeader";
import { AnnouncementBarSection } from "@/components/admin/AnnouncementBarSection";

export const Route = createFileRoute("/_authenticated/admin/cms/announcements")({
  head: () => ({ meta: [{ title: "Announcement — HABÄNE Admin" }] }),
  component: AnnouncementPage,
});

function AnnouncementPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Content"
        title="Announcement"
        description="The messages that rotate in the bar at the very top of the website. Use it to promote coupons and offers — each message saves on its own, and can be scheduled."
      />
      <section className="rounded-lg border border-border bg-card p-6">
        <AnnouncementBarSection />
      </section>
    </div>
  );
}
