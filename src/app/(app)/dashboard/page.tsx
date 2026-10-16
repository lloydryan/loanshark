import { Dashboard } from "@/components/dashboard";
import { DueReminderPreview } from "@/components/due-reminders";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <DueReminderPreview />
      <Dashboard />
    </div>
  );
}
