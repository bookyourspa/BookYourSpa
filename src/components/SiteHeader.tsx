"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Me {
  id: number;
  full_name: string;
  email: string;
  role: string;
  admin_level: string | null;
}

export function SiteHeader() {
  const [user, setUser] = useState<Me | null>(null);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [meRes, notifRes] = await Promise.all([
          fetch("/api/auth/me", { cache: "no-store" }),
          fetch("/api/notifications", { cache: "no-store" }),
        ]);
        if (!alive) return;
        if (meRes.ok) {
          const d = await meRes.json();
          setUser(d?.data?.user ?? null);
        } else {
          setUser(null);
        }
        if (notifRes.ok) {
          const n = await notifRes.json();
          setUnread(n?.data?.unread ?? 0);
        }
      } catch {
        if (alive) setUser(null);
      }
    };
    load();
    return () => { alive = false; };
  }, [pathname]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  };

  const dashHref = user?.role === "admin" ? "/admin" : user?.role === "supplier" ? "/supplier" : "/dashboard";

  return (
    <header className="sticky top-0 z-40 border-b border-[#e8e2d3] bg-cream/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4">
        <Link href="/" className="font-display text-xl font-bold text-jade">
          Book<span className="text-gold-deep"> Your </span>Spa
        </Link>
        <nav className="hidden items-center gap-5 text-sm font-medium text-ink-soft md:flex">
          <Link href="/explore" className="hover:text-jade">Explore</Link>
          <Link href="/spa/bali" className="hover:text-jade">Spas in Bali</Link>
          <Link href="/treatment/balinese-massage" className="hover:text-jade">Treatments</Link>
          <Link href="/list-your-spa" className="hover:text-jade">List your spa</Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <Link href="/dashboard?tab=notifications" className="relative text-sm text-ink-soft hover:text-jade" aria-label="Notifications">
                🔔
                {unread > 0 && (
                  <span className="absolute -right-2 -top-1 rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{unread}</span>
                )}
              </Link>
              <Link href={dashHref} className="hidden text-sm font-semibold text-jade hover:underline sm:block">
                {user.full_name.split(" ")[0]} · {user.role === "admin" ? "Admin" : user.role === "supplier" ? "Supplier" : "My bookings"}
              </Link>
              <button onClick={logout} className="btn btn-outline !px-4 !py-1.5 text-xs">Log out</button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-semibold text-ink-soft hover:text-jade">Log in</Link>
              <Link href="/register" className="btn btn-primary !px-4 !py-1.5 text-xs">Sign up</Link>
            </>
          )}
          <button
            className="md:hidden"
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
          >
            ☰
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-[#e8e2d3] bg-white px-4 py-3 text-sm md:hidden">
          <div className="flex flex-col gap-3">
            <Link href="/explore" onClick={() => setOpen(false)}>Explore</Link>
            <Link href="/spa/bali" onClick={() => setOpen(false)}>Spas in Bali</Link>
            <Link href="/list-your-spa" onClick={() => setOpen(false)}>List your spa</Link>
          </div>
        </nav>
      )}
    </header>
  );
}
