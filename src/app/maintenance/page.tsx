import { redirect } from "next/navigation";
import { MaintenanceScreen } from "@/components/maintenance-screen";
import { getAuthSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export default async function MaintenancePage() {
  const [session, settings] = await Promise.all([getAuthSession(), getSettings()]);

  if (!settings.maintenanceEnabled || session?.user.role === "ADMIN") {
    redirect(session?.user.role === "ADMIN" ? "/admin" : "/");
  }

  return (
    <MaintenanceScreen
      message={settings.maintenanceMessage}
      showLogin={!session?.user}
      showLogout={Boolean(session?.user)}
    />
  );
}
