import Link from "next/link";
import { adminView } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await adminView();
  return (
    <div>
      <div className="mb-6 flex items-center gap-4 border-b border-neutral-200 pb-3 text-sm">
        <span className="font-semibold">Admin</span>
        <Link href="/admin">Customers</Link>
        <Link href="/admin/events">Webhook events</Link>
        <span className="ml-auto text-neutral-500">{admin.viewer}</span>
      </div>
      {children}
    </div>
  );
}
