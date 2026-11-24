"use client";
import { NotificationBell } from "@/components/notifications/NotificationInbox";

import Link from "next/link";
import { useState } from "react";
import {
  HomeIcon,
  BookOpenIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  FolderIcon,
  ChartPieIcon,
  XMarkIcon,
  Bars3Icon,
  BanknotesIcon,
  BellIcon,
} from "@heroicons/react/24/solid";

export default function SideMenu() {
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { name: "Main Dashboard", href: "/", icon: HomeIcon },
    { name: "My Work", href: "/my-work", icon: DocumentTextIcon },
    { name: "All Work", href: "/todos", icon: DocumentTextIcon },
    { name: "Projects", href: "/projects", icon: FolderIcon },
    { name: "Knowledge", href: "/knowledge", icon: BookOpenIcon },
    { name: "Calendar", href: "/events", icon: FolderIcon },
    { name: "Finance", href: "/finance", icon: BanknotesIcon },
    { name: "Japanese Statistics", href: "/japanese/statistics", icon: ChartPieIcon },
    { name: "Japanese Practice", href: "/japanese/practice", icon: DocumentTextIcon },
    { name: "Notifications", href: "/notifications", icon: BellIcon },
    { name: "Settings", href: "/settings", icon: Cog6ToothIcon },
  ];

  const onMenuClick = () => {
    setIsOpen(false);
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 md:hidden"
          style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-[var(--shell-top,0px)] left-0 w-64 shrink-0 z-30 transform transition-transform duration-300
          ${isOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 md:sticky md:top-[var(--shell-top,0px)] md:shadow-none flex flex-col h-[calc(100dvh-var(--shell-top,0px))] overflow-y-auto justify-between`}
        style={{
          backgroundColor: "var(--color-card-bg)",
          borderRight: "1px solid var(--color-card-border)",
        }}
      >
        <div>
          <div
            className="flex items-center justify-between p-4 border-b"
            style={{ borderColor: "var(--color-card-border)" }}
          >
            <h1 className="text-lg font-bold" style={{ color: "var(--color-foreground)" }}>
              Dashboard Menu
            </h1>
            <NotificationBell />
            <button
              aria-label="Close navigation"
              className="md:hidden"
              style={{ color: "var(--color-foreground)" }}
              onClick={() => setIsOpen(false)}
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          <nav className="p-4 space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className="flex items-center p-2 rounded transition space-x-2"
                  style={{ color: "var(--color-foreground)" }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--accent)/10")}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  onClick={() => onMenuClick()}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <NotificationBell mobile />
      {/* Mobile hamburger button */}
      {!isOpen && (
        <button
          aria-label="Open navigation"
          className="fixed top-[calc(var(--shell-top,0px)+1rem)] left-4 z-40 p-2 rounded shadow md:hidden"
          style={{
            backgroundColor: "var(--color-card-bg)",
            color: "var(--color-foreground)",
            border: "1px solid var(--color-card-border)",
          }}
          onClick={() => setIsOpen(true)}
        >
          <Bars3Icon className="w-6 h-6" />
        </button>
      )}
    </>
  );
}
